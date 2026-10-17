import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

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
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[Classroom Sandbox Seeder] Failed to refresh ${roleLabel} Google Access Token: ${errorText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(`[Classroom Sandbox Seeder] No access_token returned for ${roleLabel}.`);
  }

  const expiresInSec = Number(data.expires_in) || 3599;
  return {
    accessToken: data.access_token,
    // Refresh 2 minutes before actual expiry
    expiresAtMs: Date.now() + (expiresInSec - 120) * 1000,
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
 * - Checks `GET /courses/:id/students/me` first (1 API call when already enrolled).
 * - Handles 409 ALREADY_EXISTS idempotently if enrollment POST is called.
 */
export async function ensureTestStudentEnrolled(courseId: string): Promise<{ userId: string; fullName: string }> {
  const cached = enrolledStudentCache.get(courseId);
  if (cached) {
    return cached;
  }

  const studentToken = await getLiveStudentAccessToken();

  // Fast-path: check if student is already enrolled (1 GET call)
  const meRes = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students/me`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });

  if (meRes.ok) {
    const meData = await meRes.json();
    const result = {
      userId: meData.userId,
      fullName: meData.profile?.name?.fullName || 'Student',
    };
    enrolledStudentCache.set(courseId, result);
    return result;
  }

  // Slow-path: fetch course enrollmentCode as teacher and join course
  const teacherToken = await getLiveTeacherAccessToken();
  const courseRes = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  if (!courseRes.ok) {
    throw new Error(`[Classroom Sandbox Seeder] Failed to fetch course ${courseId}: ${await courseRes.text()}`);
  }
  const courseData = await courseRes.json();
  const enrollmentCode = courseData.enrollmentCode;
  if (!enrollmentCode) {
    throw new Error(`[Classroom Sandbox Seeder] Course ${courseId} does not have an active enrollmentCode.`);
  }

  const enrollRes = await fetch(
    `https://classroom.googleapis.com/v1/courses/${courseId}/students?enrollmentCode=${encodeURIComponent(enrollmentCode)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 'me' }),
    }
  );

  if (enrollRes.ok) {
    const enrolled = await enrollRes.json();
    const result = {
      userId: enrolled.userId,
      fullName: enrolled.profile?.name?.fullName || 'Student',
    };
    enrolledStudentCache.set(courseId, result);
    return result;
  }

  if (enrollRes.status === 409) {
    // Student is already enrolled; read roster as teacher to get student's userId & name
    const studentsRes = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    if (studentsRes.ok) {
      const studentsData = await studentsRes.json();
      const firstStudent = studentsData.students?.[0];
      if (firstStudent) {
        const result = {
          userId: firstStudent.userId,
          fullName: firstStudent.profile?.name?.fullName || 'Student',
        };
        enrolledStudentCache.set(courseId, result);
        return result;
      }
    }
  }

  throw new Error(`[Classroom Sandbox Seeder] Failed to enroll student: ${await enrollRes.text()}`);
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

  const response = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: params.title,
      description: params.description || 'Automated E2E Test Assignment',
      state: 'PUBLISHED',
      workType: 'ASSIGNMENT',
      maxPoints: params.maxPoints ?? 100,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[Classroom Sandbox Seeder] Failed to create coursework: ${errorText}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    title: data.title,
    courseId: data.courseId,
    state: data.state,
    maxPoints: data.maxPoints,
    alternateLink: data.alternateLink,
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
}): Promise<string> {
  const studentToken = await getLiveStudentAccessToken();
  const boundary = `-------ClassroomAgentBoundary${Date.now()}`;
  const metadata = {
    name: attachment.filename,
    mimeType: attachment.mimeType,
  };

  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${attachment.mimeType}\r\n\r\n` +
    `${attachment.content}\r\n` +
    `--${boundary}--`;

  const driveRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!driveRes.ok) {
    throw new Error(`[Classroom Sandbox Seeder] Failed to upload student file to Drive: ${await driveRes.text()}`);
  }
  const driveFile = await driveRes.json();
  return driveFile.id as string;
}

/**
 * Attaches an already-uploaded Drive file (or uploads a new one) to the coursework submission
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
  }
): Promise<{ submissionId: string; studentId: string; driveFileId: string }> {
  const studentToken = await getLiveStudentAccessToken();

  // Run submission lookup and Drive upload (if not pre-uploaded) in parallel
  const [listSubRes, driveFileId] = await Promise.all([
    fetch(
      `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?userId=me`,
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    ),
    attachment.existingDriveFileId
      ? Promise.resolve(attachment.existingDriveFileId)
      : uploadStudentDriveFile(attachment),
  ]);

  if (!listSubRes.ok) {
    throw new Error(`[Classroom Sandbox Seeder] Failed to list student submission: ${await listSubRes.text()}`);
  }
  const listSubData = await listSubRes.json();
  const submission = listSubData.studentSubmissions?.[0];
  if (!submission || !submission.id) {
    throw new Error(`[Classroom Sandbox Seeder] No student submission found for courseWork ${courseWorkId}.`);
  }

  const submissionId: string = submission.id;
  const studentId: string = submission.userId;

  // Attach the Drive file to the Classroom submission
  const attachRes = await fetch(
    `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submissionId}:modifyAttachments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        addAttachments: [
          {
            driveFile: { id: driveFileId },
          },
        ],
      }),
    }
  );

  if (!attachRes.ok) {
    throw new Error(`[Classroom Sandbox Seeder] Failed to attach Drive file to submission: ${await attachRes.text()}`);
  }

  // Turn in the submission
  const turnInRes = await fetch(
    `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submissionId}:turnIn`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  if (!turnInRes.ok) {
    throw new Error(`[Classroom Sandbox Seeder] Failed to turn in student submission: ${await turnInRes.text()}`);
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
  teacherAccessToken: string;
}

/**
 * Sweeps any leftover `[E2E Batch` or `[E2E Test]` assignments from previous interrupted/crashed runs
 * so the test course stays clean.
 */
export async function sweepOrphanedTestAssignments(courseId: string): Promise<void> {
  try {
    const token = await getLiveTeacherAccessToken();
    const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const courseWorkList: any[] = data.courseWork || [];
    const orphans = courseWorkList.filter(
      (cw) =>
        typeof cw.title === 'string' &&
        (cw.title.startsWith('[E2E Batch') || cw.title.startsWith('[E2E Test]'))
    );
    if (orphans.length > 0) {
      await Promise.all(
        orphans.map((cw) => deleteLiveClassroomAssignmentFixture(courseId, cw.id))
      );
    }
  } catch {
    // Non-fatal cleanup
  }
}

/**
 * High-speed batch fixture setup for `test.beforeAll`:
 * Parallelizes token refresh, orphan sweep, student enrollment check, coursework creation, and Drive file upload
 * so an entire suite of tests can share a single seeded Classroom assignment with a unique random ID/title.
 */
export async function setupLiveClassroomBatchFixture(options?: {
  title?: string;
  description?: string;
  maxPoints?: number;
  attachment?: { filename: string; mimeType: string; content: string };
}): Promise<LiveBatchFixture> {
  // Step 1: Warm both tokens in parallel
  const [teacherAccessToken] = await Promise.all([
    getLiveTeacherAccessToken(),
    getLiveStudentAccessToken(),
  ]);

  // Step 2: Sweep any orphaned E2E assignments from previous crashed runs
  await sweepOrphanedTestAssignments(testCourseId);

  // Step 3: Verify enrollment, create coursework (with unique random tag), and upload Drive file ALL IN PARALLEL
  const randomTag = `${Math.random().toString(36).slice(2, 7)}_${Date.now()}`;
  const attachmentSpec = options?.attachment || {
    filename: 'recursion_solution.py',
    mimeType: 'text/x-python',
    content:
      'def factorial(n: int) -> int:\n    """Calculates n! recursively."""\n    return 1 if n <= 1 else n * factorial(n - 1)\n',
  };

  const [student, courseWork, driveFileId] = await Promise.all([
    ensureTestStudentEnrolled(testCourseId),
    createLiveClassroomAssignmentFixture(testCourseId, {
      title: options?.title || `[E2E Batch #${randomTag}] Recursion & Algorithm Analysis`,
      description:
        options?.description ||
        'Write a recursive factorial function in Python with clean PEP8 docstrings and base-case handling.',
      maxPoints: options?.maxPoints ?? 100,
    }),
    uploadStudentDriveFile(attachmentSpec),
  ]);

  // Step 4: Attach the already-uploaded Drive file and turn in
  const { submissionId } = await submitAndTurnInAsTestStudent(testCourseId, courseWork.id, {
    ...attachmentSpec,
    existingDriveFileId: driveFileId,
  });

  return {
    courseId: testCourseId,
    assignmentId: `${testCourseId}_${courseWork.id}`,
    courseWork,
    student,
    submissionId,
    driveFileId,
    teacherAccessToken,
  };
}

/**
 * High-speed batch fixture teardown for `test.afterAll`:
 * Reclaims submission if needed so Student regains Drive file ownership, then deletes
 * Classroom coursework and Student Drive file in parallel.
 */
export async function teardownLiveClassroomBatchFixture(fixture: LiveBatchFixture | null): Promise<void> {
  if (!fixture) return;
  try {
    const studentToken = await getLiveStudentAccessToken();
    // Reclaim submission before deleting so Google Classroom transfers Drive file ownership back to the student
    await fetch(
      `https://classroom.googleapis.com/v1/courses/${fixture.courseId}/courseWork/${fixture.courseWork.id}/studentSubmissions/${fixture.submissionId}:reclaim`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${studentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );
  } catch {
    // Ignore if already returned/reclaimed
  }

  await Promise.all([
    deleteLiveClassroomAssignmentFixture(fixture.courseId, fixture.courseWork.id),
    deleteStudentDriveFile(fixture.driveFileId),
  ]);
}

/**
 * Deletes a test file from the student's Google Drive during teardown.
 */
export async function deleteStudentDriveFile(driveFileId: string): Promise<void> {
  const studentToken = await getLiveStudentAccessToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  if (!response.ok && response.status !== 404 && response.status !== 403) {
    console.warn(`[Classroom Sandbox Seeder] Warning deleting student Drive file ${driveFileId}: ${await response.text()}`);
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

  const response = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`[Classroom Sandbox Seeder] Warning deleting courseWork ${courseWorkId}: ${errorText}`);
  }
}
