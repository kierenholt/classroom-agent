import { google, classroom_v1, drive_v3 } from 'googleapis';

const CLASSROOM_BASE_URL = 'https://classroom.googleapis.com/v1';

export function getOAuth2Client(accessToken: string) {
  if (!accessToken || accessToken.trim() === '') {
    throw new Error('[Classroom Client] Missing Google OAuth access token. Fail-fast enabled.');
  }
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

export function getDriveClient(accessToken: string): drive_v3.Drive {
  const auth = getOAuth2Client(accessToken);
  return google.drive({ version: 'v3', auth });
}

export function parseAssignmentId(assignmentId: string): { courseId: string; courseWorkId: string } {
  if (!assignmentId || !assignmentId.includes('_')) {
    throw new Error(`[Classroom Client] Invalid assignmentId format "${assignmentId}". Expected "{courseId}_{courseWorkId}". Fail-fast enabled.`);
  }
  const idx = assignmentId.indexOf('_');
  const courseId = assignmentId.slice(0, idx).trim();
  const courseWorkId = assignmentId.slice(idx + 1).trim();
  if (!courseId || !courseWorkId) {
    throw new Error(`[Classroom Client] Malformed assignmentId "${assignmentId}". Fail-fast enabled.`);
  }
  return { courseId, courseWorkId };
}

async function classroomFetch<T>(accessToken: string, endpoint: string, init?: RequestInit): Promise<T> {
  if (!accessToken || accessToken.trim() === '') {
    throw new Error('[Classroom Client] Missing Google OAuth access token. Fail-fast enabled.');
  }
  const res = await fetch(`${CLASSROOM_BASE_URL}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Classroom API HTTP ${res.status}: ${errText}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/**
 * List active courses where the authenticated teacher teaches.
 */
export async function listTeacherCourses(accessToken: string): Promise<classroom_v1.Schema$Course[]> {
  const data = await classroomFetch<{ courses?: classroom_v1.Schema$Course[] }>(
    accessToken,
    '/courses?teacherId=me&courseStates=ACTIVE'
  );
  return data.courses || [];
}

/**
 * Get details for a specific course.
 */
export async function getCourse(accessToken: string, courseId: string): Promise<classroom_v1.Schema$Course> {
  if (!courseId) throw new Error('[Classroom Client] courseId is required.');
  return classroomFetch<classroom_v1.Schema$Course>(accessToken, `/courses/${encodeURIComponent(courseId)}`);
}

/**
 * List coursework items for a course.
 */
export async function listCourseWork(accessToken: string, courseId: string): Promise<classroom_v1.Schema$CourseWork[]> {
  if (!courseId) throw new Error('[Classroom Client] courseId is required.');
  const data = await classroomFetch<{ courseWork?: classroom_v1.Schema$CourseWork[] }>(
    accessToken,
    `/courses/${encodeURIComponent(courseId)}/courseWork`
  );
  return data.courseWork || [];
}

/**
 * Get details for a specific coursework item.
 */
export async function getCourseWork(
  accessToken: string,
  courseId: string,
  courseWorkId: string
): Promise<classroom_v1.Schema$CourseWork> {
  if (!courseId || !courseWorkId) {
    throw new Error('[Classroom Client] courseId and courseWorkId are required.');
  }
  return classroomFetch<classroom_v1.Schema$CourseWork>(
    accessToken,
    `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}`
  );
}

/**
 * Clones existing coursework under the application's OAuth client ID.
 * This guarantees full write-back eligibility for draftGrade, assignedGrade, and return.
 */
export async function cloneCourseWorkUnderApp(
  accessToken: string,
  courseId: string,
  sourceCourseWorkId: string
): Promise<classroom_v1.Schema$CourseWork> {
  if (!courseId || !sourceCourseWorkId) {
    throw new Error('[Classroom Client] courseId and sourceCourseWorkId are required to clone.');
  }
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

  return classroomFetch<classroom_v1.Schema$CourseWork>(
    accessToken,
    `/courses/${encodeURIComponent(courseId)}/courseWork`,
    {
      method: 'POST',
      body: JSON.stringify(newCourseWork),
    }
  );
}

/**
 * Fetch all enrolled students for a course.
 */
export async function listCourseStudents(
  accessToken: string,
  courseId: string
): Promise<classroom_v1.Schema$Student[]> {
  if (!courseId) throw new Error('[Classroom Client] courseId is required.');
  const data = await classroomFetch<{ students?: classroom_v1.Schema$Student[] }>(
    accessToken,
    `/courses/${encodeURIComponent(courseId)}/students`
  );
  return data.students || [];
}

/**
 * Fetch all student submissions for a coursework item.
 */
export async function listCourseWorkSubmissions(
  accessToken: string,
  courseId: string,
  courseWorkId: string
): Promise<classroom_v1.Schema$StudentSubmission[]> {
  if (!courseId || !courseWorkId) {
    throw new Error('[Classroom Client] courseId and courseWorkId are required.');
  }
  const data = await classroomFetch<{ studentSubmissions?: classroom_v1.Schema$StudentSubmission[] }>(
    accessToken,
    `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}/studentSubmissions`
  );
  return data.studentSubmissions || [];
}

/**
 * Maps a raw Google Classroom StudentSubmission + Student profile into our structured live submission format.
 */
export function mapLiveClassroomSubmission(
  sub: classroom_v1.Schema$StudentSubmission,
  profile?: { name: string; email?: string | null; photoUrl?: string | null }
) {
  const studentId = sub.userId || sub.id!;
  const isReturned = sub.state === 'RETURNED';
  const hasDraft = sub.draftGrade !== undefined && sub.draftGrade !== null;

  const attachments: any[] = [];
  const driveFiles = sub.assignmentSubmission?.attachments || [];
  for (const att of driveFiles) {
    if (att.driveFile) {
      const file = att.driveFile;
      let fileType = 'PDF';
      const title = file.title || 'Attachment';

      if (title.endsWith('.doc') || title.endsWith('.docx') || file.alternateLink?.includes('document')) {
        fileType = 'GOOGLE_DOC';
      } else if (title.endsWith('.ppt') || title.endsWith('.pptx') || file.alternateLink?.includes('presentation')) {
        fileType = 'GOOGLE_SLIDES';
      } else if (title.endsWith('.xls') || title.endsWith('.xlsx') || file.alternateLink?.includes('spreadsheets')) {
        fileType = 'GOOGLE_SHEETS';
      } else if (
        title.endsWith('.py') ||
        title.endsWith('.js') ||
        title.endsWith('.ts') ||
        title.endsWith('.java') ||
        title.endsWith('.cpp') ||
        title.endsWith('.html') ||
        title.endsWith('.css') ||
        title.endsWith('.json') ||
        title.endsWith('.md')
      ) {
        fileType = 'CODE';
      } else if (title.endsWith('.png') || title.endsWith('.jpg') || title.endsWith('.jpeg') || title.endsWith('.webp')) {
        fileType = 'IMAGE';
      }

      attachments.push({
        id: file.id || `file_${studentId}`,
        title,
        type: fileType,
        driveFileId: file.id,
        alternateLink: file.alternateLink,
        thumbnailUrl: file.thumbnailUrl,
      });
    } else if (att.link) {
      attachments.push({
        id: `link_${studentId}`,
        title: att.link.title || att.link.url || 'Link',
        type: 'LINK',
        alternateLink: att.link.url,
      });
    }
  }

  if (sub.shortAnswerSubmission) {
    attachments.push({
      id: `sa_${sub.id}`,
      title: 'Short Answer Response',
      type: 'SHORT_ANSWER',
      shortAnswer: sub.shortAnswerSubmission.answer || '',
    });
  }

  return {
    studentId,
    submissionId: sub.id || studentId,
    studentName: profile?.name || `Student ${studentId.slice(0, 6)}`,
    studentEmail: profile?.email || undefined,
    studentAvatarUrl: profile?.photoUrl || undefined,
    state: (sub.state || 'CREATED') as 'CREATED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED_BY_STUDENT',
    late: sub.late || false,
    attachments,
    draftGrade: sub.draftGrade ?? undefined,
    assignedGrade: sub.assignedGrade ?? undefined,
    rubricBreakdown: [],
    overallFeedback: '',
    comments: [],
    classroomSyncStatus: isReturned ? 'RETURNED' : hasDraft ? 'SYNCED_DRAFT' : 'UNSAVED',
    updatedAt: sub.updateTime || new Date().toISOString(),
  };
}

/**
 * Fetches the complete live Classroom workspace (Course + CourseWork + Roster + Submissions)
 * directly from the Google Classroom API in parallel.
 */
export async function fetchLiveWorkspaceFromClassroom(
  accessToken: string,
  courseId: string,
  courseWorkId: string
) {
  const [course, coursework, students, rawSubmissions] = await Promise.all([
    getCourse(accessToken, courseId),
    getCourseWork(accessToken, courseId, courseWorkId),
    listCourseStudents(accessToken, courseId),
    listCourseWorkSubmissions(accessToken, courseId, courseWorkId),
  ]);

  const studentMap = new Map<string, { name: string; email?: string | null; photoUrl?: string | null }>();
  for (const st of students) {
    if (st.userId) {
      studentMap.set(st.userId, {
        name: st.profile?.name?.fullName || `Student ${st.userId.slice(0, 6)}`,
        email: st.profile?.emailAddress,
        photoUrl: st.profile?.photoUrl,
      });
    }
  }

  const submissions = rawSubmissions.map((sub) =>
    mapLiveClassroomSubmission(sub, studentMap.get(sub.userId || ''))
  );

  const turnedInCount = submissions.filter((s) => s.state === 'TURNED_IN').length;
  const returnedCount = submissions.filter((s) => s.state === 'RETURNED').length;
  const draftGradedCount = submissions.filter((s) => s.draftGrade !== undefined && s.state !== 'RETURNED').length;

  const assignmentId = `${courseId}_${courseWorkId}`;
  const assignment = {
    id: assignmentId,
    courseId,
    courseName: course.name || 'Classroom Course',
    courseWorkId,
    title: coursework.title || 'Classroom Assignment',
    description: coursework.description || '',
    maxPoints: coursework.maxPoints || 100,
    dueDate: coursework.dueDate
      ? `${coursework.dueDate.year}-${coursework.dueDate.month}-${coursework.dueDate.day}`
      : undefined,
    state: (coursework.state || 'PUBLISHED') as 'PUBLISHED' | 'DRAFT',
    apiWriteBackEligible: coursework.associatedWithDeveloper || false,
    submissionStats: {
      total: submissions.length,
      turnedIn: turnedInCount,
      draftGraded: draftGradedCount,
      returned: returnedCount,
      missing: Math.max(0, submissions.length - turnedInCount - returnedCount),
    },
    createdAt: coursework.creationTime || new Date().toISOString(),
    updatedAt: coursework.updateTime || new Date().toISOString(),
  };

  return { assignment, submissions };
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

  return classroomFetch<classroom_v1.Schema$StudentSubmission>(
    accessToken,
    `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}/studentSubmissions/${encodeURIComponent(submissionId)}?updateMask=${updateMaskParts.join(',')}`,
    {
      method: 'PATCH',
      body: JSON.stringify(requestBody),
    }
  );
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
  return classroomFetch<Record<string, never>>(
    accessToken,
    `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}/studentSubmissions/${encodeURIComponent(submissionId)}:return`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  );
}
