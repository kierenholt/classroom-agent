import { Readable } from 'stream';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Provide Node 20's built-in fetch to gaxios (gaxios 6.x only checks window.fetch and otherwise falls back to node-fetch 2.7.0)
const node20FetchImplementation = (input: any, init?: any) =>
  globalThis.fetch(input, {
    ...init,
    ...(init?.body ? { duplex: 'half' } : {}),
  } as RequestInit);

google.options({
  fetchImplementation: node20FetchImplementation as any,
});

function createConfiguredOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.transporter.defaults = {
    ...oauth2Client.transporter.defaults,
    fetchImplementation: node20FetchImplementation as any,
  };
  return oauth2Client;
}

function requireTestEnv(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === '') {
    throw new Error(`[Classroom Sandbox Seeder] Missing mandatory environment variable: ${key} in .env.local. Fail-fast enabled.`);
  }
  return val.trim();
}

const clientId = requireTestEnv('TEST_GOOGLE_CLIENT_ID');
const clientSecret = requireTestEnv('TEST_GOOGLE_CLIENT_SECRET');
const teacherRefreshToken = requireTestEnv('TEST_TEACHER_REFRESH_TOKEN');
const studentRefreshToken = requireTestEnv('TEST_STUDENT_REFRESH_TOKEN');
export const testCourseId = requireTestEnv('TEST_CLASSROOM_COURSE_ID');

// ---------------------------------------------------------------------------
// 1. In-Memory Token & Enrollment Caches (Eliminates redundant API round-trips)
// ---------------------------------------------------------------------------
interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

let cachedTeacherToken: CachedToken | null = null;
let cachedStudentToken: CachedToken | null = null;
const enrolledStudentCache = new Map<string, { userId: string; fullName: string }>();

async function exchangeRefreshToken(refreshToken: string, roleLabel: string): Promise<CachedToken> {
  const oauth2Client = createConfiguredOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { token, res } = await oauth2Client.getAccessToken();
  if (!token) {
    throw new Error(`[Classroom Sandbox Seeder] No access_token returned for ${roleLabel}.`);
  }

  const expiresInSec = Number(res?.data?.expires_in) || 3599;
  return {
    accessToken: token,
    // Refresh 2 minutes before actual expiry
    expiresAtMs: Date.now() + (expiresInSec - 120) * 1000,
  };
}

function getAuthenticatedClients(accessToken: string) {
  const auth = createConfiguredOAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  return {
    classroom: google.classroom({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

/**
 * Returns a valid Google Access Token for the test teacher account (cached in-memory for the test batch).
 */
export async function getLiveTeacherAccessToken(): Promise<string> {
  if (cachedTeacherToken && Date.now() < cachedTeacherToken.expiresAtMs) {
    return cachedTeacherToken.accessToken;
  }
  cachedTeacherToken = await exchangeRefreshToken(teacherRefreshToken, 'Teacher');
  return cachedTeacherToken.accessToken;
}

/**
 * Mints a live Firebase custom authentication token for the test teacher account using serviceAccountKey.json.
 */
export async function getLiveTestTeacherCustomToken(): Promise<string> {
  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const saPath = saEnv
    ? path.resolve(process.cwd(), saEnv)
    : path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (!fs.existsSync(saPath)) {
    throw new Error(`[Classroom Sandbox Seeder] Service account file not found at: ${saPath}. Fail-fast enabled.`);
  }
  if (getApps().length === 0) {
    const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    initializeApp({
      credential: cert(sa),
      projectId: sa.project_id || 'classroom-agent-511917',
    });
  }
  return getAuth().createCustomToken('teacher_live_e2e', {
    name: 'Teacher E2E',
    role: 'teacher',
  });
}


/**
 * Returns a valid Google Access Token for the test student account (cached in-memory for the test batch).
 */
export async function getLiveStudentAccessToken(): Promise<string> {
  if (cachedStudentToken && Date.now() < cachedStudentToken.expiresAtMs) {
    return cachedStudentToken.accessToken;
  }
  cachedStudentToken = await exchangeRefreshToken(studentRefreshToken, 'Student');
  return cachedStudentToken.accessToken;
}

/**
 * Fast-path student enrollment verification:
 * - Returns immediately from in-memory cache if already verified in this process (0 API calls).
 * - Checks `classroom.courses.students.get({ courseId, userId: 'me' })` first (1 API call when already enrolled).
 * - Handles 409 ALREADY_EXISTS idempotently if enrollment create is called.
 */
export async function ensureTestStudentEnrolled(courseId: string): Promise<{ userId: string; fullName: string }> {
  const cached = enrolledStudentCache.get(courseId);
  if (cached) {
    return cached;
  }

  const studentToken = await getLiveStudentAccessToken();
  const { classroom: studentClassroom } = getAuthenticatedClients(studentToken);

  // Fast-path: check if student is already enrolled (1 GET call)
  try {
    const meRes = await studentClassroom.courses.students.get({
      courseId,
      userId: 'me',
    });
    if (meRes.data && meRes.data.userId) {
      const result = {
        userId: meRes.data.userId,
        fullName: meRes.data.profile?.name?.fullName || 'Student',
      };
      enrolledStudentCache.set(courseId, result);
      return result;
    }
  } catch {
    // Student not yet enrolled or 404; proceed to slow-path
  }

  // Slow-path: fetch course enrollmentCode as teacher and join course
  const teacherToken = await getLiveTeacherAccessToken();
  const { classroom: teacherClassroom } = getAuthenticatedClients(teacherToken);

  const courseRes = await teacherClassroom.courses.get({ id: courseId });
  const enrollmentCode = courseRes.data.enrollmentCode;
  if (!enrollmentCode) {
    throw new Error(`[Classroom Sandbox Seeder] Course ${courseId} does not have an active enrollmentCode.`);
  }

  try {
    const enrollRes = await studentClassroom.courses.students.create({
      courseId,
      enrollmentCode,
      requestBody: { userId: 'me' },
    });
    const result = {
      userId: enrollRes.data.userId!,
      fullName: enrollRes.data.profile?.name?.fullName || 'Student',
    };
    enrolledStudentCache.set(courseId, result);
    return result;
  } catch (err: any) {
    if (err?.code === 409 || err?.response?.status === 409) {
      const studentsRes = await teacherClassroom.courses.students.list({ courseId });
      const firstStudent = studentsRes.data.students?.[0];
      if (firstStudent && firstStudent.userId) {
        const result = {
          userId: firstStudent.userId,
          fullName: firstStudent.profile?.name?.fullName || 'Student',
        };
        enrolledStudentCache.set(courseId, result);
        return result;
      }
    }
    throw new Error(`[Classroom Sandbox Seeder] Failed to enroll student: ${err.message}`);
  }
}

export interface LiveCourseWorkParams {
  title: string;
  description?: string;
  maxPoints?: number;
}

export interface LiveCourseWorkResult {
  id: string;
  title: string;
  courseId: string;
  state: string;
  maxPoints?: number;
  alternateLink?: string;
}

/**
 * Creates a real coursework assignment in the test Google Classroom course.
 */
export async function createLiveClassroomAssignmentFixture(
  courseId: string,
  params: LiveCourseWorkParams
): Promise<LiveCourseWorkResult> {
  const token = await getLiveTeacherAccessToken();
  const { classroom } = getAuthenticatedClients(token);

  const res = await classroom.courses.courseWork.create({
    courseId,
    requestBody: {
      title: params.title,
      description: params.description || 'Automated E2E Test Assignment',
      state: 'PUBLISHED',
      workType: 'ASSIGNMENT',
      maxPoints: params.maxPoints ?? 100,
    },
  });

  const data = res.data;
  return {
    id: data.id!,
    title: data.title!,
    courseId: data.courseId!,
    state: data.state!,
    maxPoints: data.maxPoints ?? undefined,
    alternateLink: data.alternateLink ?? undefined,
  };
}

/**
 * Uploads a test file to the student's Google Drive.
 * Separated so it can run in parallel with coursework creation during batch setup.
 */
export async function uploadStudentDriveFile(attachment: {
  filename: string;
  mimeType: string;
  content: string;
  mediaMimeType?: string;
}): Promise<string> {
  const studentToken = await getLiveStudentAccessToken();
  const { drive } = getAuthenticatedClients(studentToken);

  const isGoogleWorkspaceDoc = attachment.mimeType.startsWith('application/vnd.google-apps.');
  const uploadMediaMimeType =
    attachment.mediaMimeType || (isGoogleWorkspaceDoc ? 'text/plain' : attachment.mimeType);

  const res = await drive.files.create({
    requestBody: {
      name: attachment.filename,
      mimeType: attachment.mimeType,
    },
    media: {
      mimeType: uploadMediaMimeType,
      body: Readable.from([attachment.content]),
    },
    fields: 'id',
  });

  if (!res.data.id) {
    throw new Error('[Classroom Sandbox Seeder] Drive file upload succeeded but no file ID was returned.');
  }
  return res.data.id;
}

/**
 * Attaches already-uploaded Drive file(s) (or uploads a new one) to the coursework submission
 * and turns in the submission.
 */
export async function submitAndTurnInAsTestStudent(
  courseId: string,
  courseWorkId: string,
  attachment: {
    filename: string;
    mimeType: string;
    content: string;
    existingDriveFileId?: string;
    additionalDriveFileIds?: string[];
  }
): Promise<{ submissionId: string; studentId: string; driveFileId: string }> {
  const studentToken = await getLiveStudentAccessToken();
  const { classroom } = getAuthenticatedClients(studentToken);

  // Run submission lookup and Drive upload (if not pre-uploaded) in parallel
  const [listSubRes, driveFileId] = await Promise.all([
    classroom.courses.courseWork.studentSubmissions.list({
      courseId,
      courseWorkId,
      userId: 'me',
    }),
    attachment.existingDriveFileId
      ? Promise.resolve(attachment.existingDriveFileId)
      : uploadStudentDriveFile(attachment),
  ]);

  const submission = listSubRes.data.studentSubmissions?.[0];
  if (!submission || !submission.id || !submission.userId) {
    throw new Error(`[Classroom Sandbox Seeder] No student submission found for courseWork ${courseWorkId}.`);
  }

  const submissionId: string = submission.id;
  const studentId: string = submission.userId;

  const allDriveFileIds = [driveFileId, ...(attachment.additionalDriveFileIds || [])];

  // Attach the Drive file(s) to the Classroom submission (with retry for transient 5xx Classroom backendError)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await classroom.courses.courseWork.studentSubmissions.modifyAttachments({
        courseId,
        courseWorkId,
        id: submissionId,
        requestBody: {
          addAttachments: allDriveFileIds.map((id) => ({
            driveFile: { id },
          })),
        },
      });
      break;
    } catch (err: any) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  // Turn in the submission (with retry for transient 5xx Classroom backendError)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await classroom.courses.courseWork.studentSubmissions.turnIn({
        courseId,
        courseWorkId,
        id: submissionId,
        requestBody: {},
      });
      break;
    } catch (err: any) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  return { submissionId, studentId, driveFileId };
}

export interface LiveBatchFixture {
  courseId: string;
  assignmentId: string;
  courseWork: LiveCourseWorkResult;
  student: { userId: string; fullName: string };
  submissionId: string;
  driveFileId: string;
  googleDocFileId: string;
  googleDocTitle: string;
  googleDocContent: string;
  teacherAccessToken: string;
  customAuthToken: string;
}

/**
 * Sweeps any leftover `[E2E Batch` or `[E2E Test]` assignments from previous interrupted/crashed runs
 * so the test course stays clean.
 */
export async function sweepOrphanedTestAssignments(courseId: string): Promise<void> {
  try {
    const token = await getLiveTeacherAccessToken();
    const { classroom } = getAuthenticatedClients(token);
    const res = await classroom.courses.courseWork.list({ courseId });
    const courseWorkList = res.data.courseWork || [];
    const orphans = courseWorkList.filter(
      (cw) =>
        typeof cw.title === 'string' &&
        (cw.title.startsWith('[E2E Batch') || cw.title.startsWith('[E2E Test]'))
    );
    if (orphans.length > 0) {
      await Promise.all(
        orphans.map((cw) => (cw.id ? deleteLiveClassroomAssignmentFixture(courseId, cw.id) : Promise.resolve()))
      );
    }
  } catch {
    // Non-fatal cleanup
  }
}

/**
 * High-speed batch fixture setup for `test.beforeAll`:
 * Parallelizes token refresh, orphan sweep, student enrollment check, coursework creation, and Drive file uploads
 * so an entire suite of tests can share a single seeded Classroom assignment with a unique random ID/title.
 */
export async function setupLiveClassroomBatchFixture(options?: {
  title?: string;
  description?: string;
  maxPoints?: number;
  attachment?: { filename: string; mimeType: string; content: string };
  googleDocAttachment?: { filename: string; content: string };
}): Promise<LiveBatchFixture> {
  // Step 1: Warm both tokens and generate live Firebase custom token in parallel
  const [teacherAccessToken, _studentToken, customAuthToken] = await Promise.all([
    getLiveTeacherAccessToken(),
    getLiveStudentAccessToken(),
    getLiveTestTeacherCustomToken(),
  ]);

  // Step 2: Sweep any orphaned E2E assignments from previous crashed runs
  await sweepOrphanedTestAssignments(testCourseId);

  // Step 3: Verify enrollment, create coursework (with unique random tag), and upload Drive files ALL IN PARALLEL
  const randomTag = `${Math.random().toString(36).slice(2, 7)}_${Date.now()}`;
  const attachmentSpec = options?.attachment || {
    filename: 'recursion_solution.py',
    mimeType: 'text/x-python',
    content:
      'def factorial(n: int) -> int:\n    """Calculates n! recursively."""\n    return 1 if n <= 1 else n * factorial(n - 1)\n',
  };

  const googleDocSpec = {
    filename: options?.googleDocAttachment?.filename || 'Recursion Complexity Essay',
    mimeType: 'application/vnd.google-apps.document',
    mediaMimeType: 'text/plain',
    content:
      options?.googleDocAttachment?.content ||
      'Thesis Statement: Recursive factorial algorithms operate in O(n) linear time complexity and O(n) call-stack space complexity.',
  };

  const [student, courseWork, driveFileId, googleDocFileId] = await Promise.all([
    ensureTestStudentEnrolled(testCourseId),
    createLiveClassroomAssignmentFixture(testCourseId, {
      title: options?.title || `[E2E Batch #${randomTag}] Recursion & Algorithm Analysis`,
      description:
        options?.description ||
        'Write a recursive factorial function in Python with clean PEP8 docstrings and a Google Doc complexity analysis.',
      maxPoints: options?.maxPoints ?? 100,
    }),
    uploadStudentDriveFile(attachmentSpec),
    uploadStudentDriveFile(googleDocSpec),
  ]);

  // Step 4: Attach the already-uploaded Drive files and turn in
  const { submissionId } = await submitAndTurnInAsTestStudent(testCourseId, courseWork.id, {
    ...attachmentSpec,
    existingDriveFileId: driveFileId,
    additionalDriveFileIds: [googleDocFileId],
  });

  return {
    courseId: testCourseId,
    assignmentId: `${testCourseId}_${courseWork.id}`,
    courseWork,
    student,
    submissionId,
    driveFileId,
    googleDocFileId,
    googleDocTitle: googleDocSpec.filename,
    googleDocContent: googleDocSpec.content,
    teacherAccessToken,
    customAuthToken,
  };
}

/**
 * High-speed batch fixture teardown for `test.afterAll`:
 * Reclaims submission if needed so Student regains Drive file ownership, then deletes
 * Classroom coursework and Student Drive files in parallel.
 */
export async function teardownLiveClassroomBatchFixture(fixture: LiveBatchFixture | null): Promise<void> {
  if (!fixture) return;
  try {
    const studentToken = await getLiveStudentAccessToken();
    const { classroom } = getAuthenticatedClients(studentToken);
    // Reclaim submission before deleting so Google Classroom transfers Drive file ownership back to the student
    await classroom.courses.courseWork.studentSubmissions.reclaim({
      courseId: fixture.courseId,
      courseWorkId: fixture.courseWork.id,
      id: fixture.submissionId,
      requestBody: {},
    });
  } catch {
    // Ignore if already returned/reclaimed
  }

  await Promise.all([
    deleteLiveClassroomAssignmentFixture(fixture.courseId, fixture.courseWork.id),
    deleteStudentDriveFile(fixture.driveFileId),
    fixture.googleDocFileId ? deleteStudentDriveFile(fixture.googleDocFileId) : Promise.resolve(),
  ]);
}

/**
 * Deletes a test file from the student's Google Drive during teardown.
 */
export async function deleteStudentDriveFile(driveFileId: string): Promise<void> {
  const studentToken = await getLiveStudentAccessToken();
  const { drive } = getAuthenticatedClients(studentToken);
  try {
    await drive.files.delete({ fileId: driveFileId });
  } catch (err: any) {
    const status = err?.code || err?.response?.status;
    if (status !== 404 && status !== 403) {
      console.warn(`[Classroom Sandbox Seeder] Warning deleting student Drive file ${driveFileId}: ${err.message}`);
    }
  }
}

/**
 * Deletes a coursework assignment from the test Google Classroom course.
 */
export async function deleteLiveClassroomAssignmentFixture(
  courseId: string,
  courseWorkId: string
): Promise<void> {
  const token = await getLiveTeacherAccessToken();
  const { classroom } = getAuthenticatedClients(token);
  try {
    await classroom.courses.courseWork.delete({
      courseId,
      id: courseWorkId,
    });
  } catch (err: any) {
    console.warn(`[Classroom Sandbox Seeder] Warning deleting courseWork ${courseWorkId}: ${err.message}`);
  }
}

/**
 * Fetches a StudentSubmission directly from the live Google Classroom API to assert
 * draftGrade, assignedGrade, state, and attached feedback Google Docs.
 */
export async function getLiveStudentSubmissionFromClassroom(
  courseId: string,
  courseWorkId: string,
  submissionId: string
) {
  const token = await getLiveTeacherAccessToken();
  const { classroom } = getAuthenticatedClients(token);
  const res = await classroom.courses.courseWork.studentSubmissions.get({
    courseId,
    courseWorkId,
    id: submissionId,
  });
  return res.data;
}

