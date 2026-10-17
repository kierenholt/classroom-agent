import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

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

async function exchangeRefreshToken(refreshToken: string, roleLabel: string): Promise<string> {
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

  return data.access_token;
}

/**
 * Returns a fresh, active Google Access Token for the test teacher account.
 */
export async function getLiveTeacherAccessToken(): Promise<string> {
  return exchangeRefreshToken(teacherRefreshToken, 'Teacher');
}

/**
 * Returns a fresh, active Google Access Token for the test student account.
 */
export async function getLiveStudentAccessToken(): Promise<string> {
  return exchangeRefreshToken(studentRefreshToken, 'Student');
}

/**
 * Enrolls the test student account into the specified Google Classroom course using its enrollment code.
 * Idempotent: succeeds if the student is already enrolled.
 */
export async function ensureTestStudentEnrolled(courseId: string): Promise<{ userId: string; fullName: string }> {
  const teacherToken = await getLiveTeacherAccessToken();
  const studentToken = await getLiveStudentAccessToken();

  // 1. Fetch course details as teacher to obtain the active enrollmentCode
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

  // 2. Enroll student using enrollmentCode
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
    return {
      userId: enrolled.userId,
      fullName: enrolled.profile?.name?.fullName || 'Student',
    };
  }

  // Handle 409 ALREADY_EXISTS (student is already enrolled in the course)
  if (enrollRes.status === 409) {
    const meRes = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students/me`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (!meRes.ok) {
      throw new Error(`[Classroom Sandbox Seeder] Student already enrolled check failed: ${await meRes.text()}`);
    }
    const meData = await meRes.json();
    return {
      userId: meData.userId,
      fullName: meData.profile?.name?.fullName || 'Student',
    };
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
 * Uploads a test file to the student's Google Drive, attaches it to the coursework submission,
 * and turns in the submission.
 */
export async function submitAndTurnInAsTestStudent(
  courseId: string,
  courseWorkId: string,
  attachment: {
    filename: string;
    mimeType: string;
    content: string;
  }
): Promise<{ submissionId: string; studentId: string; driveFileId: string }> {
  const studentToken = await getLiveStudentAccessToken();

  // 1. Get the student's submission record for this coursework
  const listSubRes = await fetch(
    `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?userId=me`,
    {
      headers: { Authorization: `Bearer ${studentToken}` },
    }
  );
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

  // 2. Upload file to Student's Google Drive using multipart upload
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
  const driveFileId: string = driveFile.id;

  // 3. Attach the Drive file to the Classroom submission
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

  // 4. Turn in the submission
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

/**
 * Deletes a test file from the student's Google Drive during teardown.
 */
export async function deleteStudentDriveFile(driveFileId: string): Promise<void> {
  const studentToken = await getLiveStudentAccessToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  if (!response.ok && response.status !== 404) {
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
