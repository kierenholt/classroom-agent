import { google, classroom_v1, drive_v3 } from 'googleapis';

export function getOAuth2Client(accessToken: string) {
  if (!accessToken || accessToken.trim() === '') {
    throw new Error('[Classroom Client] Missing Google OAuth access token. Fail-fast enabled.');
  }
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

export function getClassroomClient(accessToken: string): classroom_v1.Classroom {
  const auth = getOAuth2Client(accessToken);
  return google.classroom({ version: 'v1', auth });
}

export function getDriveClient(accessToken: string): drive_v3.Drive {
  const auth = getOAuth2Client(accessToken);
  return google.drive({ version: 'v3', auth });
}

/**
 * List active courses where the authenticated teacher teaches.
 */
export async function listTeacherCourses(accessToken: string) {
  const classroom = getClassroomClient(accessToken);
  const response = await classroom.courses.list({
    teacherId: 'me',
    courseStates: ['ACTIVE'],
  });
  return response.data.courses || [];
}

/**
 * List coursework items for a course.
 */
export async function listCourseWork(accessToken: string, courseId: string) {
  if (!courseId) throw new Error('[Classroom Client] courseId is required.');
  const classroom = getClassroomClient(accessToken);
  const response = await classroom.courses.courseWork.list({ courseId });
  return response.data.courseWork || [];
}

/**
 * Get details for a specific coursework item.
 */
export async function getCourseWork(accessToken: string, courseId: string, courseWorkId: string) {
  if (!courseId || !courseWorkId) {
    throw new Error('[Classroom Client] courseId and courseWorkId are required.');
  }
  const classroom = getClassroomClient(accessToken);
  const response = await classroom.courses.courseWork.get({
    courseId,
    id: courseWorkId,
  });
  return response.data;
}

/**
 * Clones existing coursework under the application's OAuth client ID.
 * This guarantees full write-back eligibility for draftGrade, assignedGrade, and return.
 */
export async function cloneCourseWorkUnderApp(accessToken: string, courseId: string, sourceCourseWorkId: string) {
  if (!courseId || !sourceCourseWorkId) {
    throw new Error('[Classroom Client] courseId and sourceCourseWorkId are required to clone.');
  }
  const classroom = getClassroomClient(accessToken);
  const original = await getCourseWork(accessToken, courseId, sourceCourseWorkId);

  const newCourseWork: classroom_v1.Schema$CourseWork = {
    title: `${original.title || 'Assignment'} (Classroom Agent)`,
    description: original.description,
    state: 'PUBLISHED',
    workType: original.workType || 'ASSIGNMENT',
    maxPoints: original.maxPoints || 100,
    dueDate: original.dueDate,
    dueTime: original.dueTime,
    submissionModificationMode: original.submissionModificationMode || 'MODIFIABLE_UNTIL_TURNED_IN',
  };

  const response = await classroom.courses.courseWork.create({
    courseId,
    requestBody: newCourseWork,
  });

  return response.data;
}

/**
 * Fetch all enrolled students for a course.
 */
export async function listCourseStudents(accessToken: string, courseId: string) {
  if (!courseId) throw new Error('[Classroom Client] courseId is required.');
  const classroom = getClassroomClient(accessToken);
  const response = await classroom.courses.students.list({ courseId });
  return response.data.students || [];
}

/**
 * Fetch all student submissions for a coursework item.
 */
export async function listCourseWorkSubmissions(accessToken: string, courseId: string, courseWorkId: string) {
  if (!courseId || !courseWorkId) {
    throw new Error('[Classroom Client] courseId and courseWorkId are required.');
  }
  const classroom = getClassroomClient(accessToken);
  const response = await classroom.courses.courseWork.studentSubmissions.list({
    courseId,
    courseWorkId,
  });
  return response.data.studentSubmissions || [];
}

/**
 * Patch student submission grade (draftGrade and/or assignedGrade).
 */
export async function patchSubmissionGrade(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
  submissionId: string,
  draftGrade?: number,
  assignedGrade?: number
) {
  if (!courseId || !courseWorkId || !submissionId) {
    throw new Error('[Classroom Client] courseId, courseWorkId, and submissionId are required.');
  }
  const classroom = getClassroomClient(accessToken);

  const updateMaskParts: string[] = [];
  const requestBody: classroom_v1.Schema$StudentSubmission = {};

  if (draftGrade !== undefined) {
    updateMaskParts.push('draftGrade');
    requestBody.draftGrade = draftGrade;
  }
  if (assignedGrade !== undefined) {
    updateMaskParts.push('assignedGrade');
    requestBody.assignedGrade = assignedGrade;
  }

  if (updateMaskParts.length === 0) {
    throw new Error('[Classroom Client] Either draftGrade or assignedGrade must be specified.');
  }

  const response = await classroom.courses.courseWork.studentSubmissions.patch({
    courseId,
    courseWorkId,
    id: submissionId,
    updateMask: updateMaskParts.join(','),
    requestBody,
  });

  return response.data;
}

/**
 * Return a student submission, officially publishing the grade and notifying the student.
 */
export async function returnSubmission(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
  submissionId: string
) {
  if (!courseId || !courseWorkId || !submissionId) {
    throw new Error('[Classroom Client] courseId, courseWorkId, and submissionId are required to return.');
  }
  const classroom = getClassroomClient(accessToken);
  const response = await classroom.courses.courseWork.studentSubmissions.return({
    courseId,
    courseWorkId,
    id: submissionId,
    requestBody: {},
  });
  return response.data;
}
