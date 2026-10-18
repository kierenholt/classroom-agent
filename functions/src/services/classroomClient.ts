import { google, classroom_v1, drive_v3 } from 'googleapis';

// Provide Node 20's built-in fetch to gaxios (gaxios 6.x only checks window.fetch and otherwise falls back to node-fetch 2.7.0)
const node20FetchImplementation = (input: any, init?: any) =>
  globalThis.fetch(input, {
    ...init,
    ...(init?.body ? { duplex: 'half' } : {}),
  } as RequestInit);

google.options({
  fetchImplementation: node20FetchImplementation as any,
});

export function getOAuth2Client(accessToken: string) {
  if (!accessToken || accessToken.trim() === '') {
    throw new Error('[Classroom Client] Missing Google OAuth access token. Fail-fast enabled.');
  }
  const auth = new google.auth.OAuth2();
  auth.transporter.defaults = {
    ...auth.transporter.defaults,
    fetchImplementation: node20FetchImplementation as any,
  };
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

/**
 * List active courses where the authenticated teacher teaches.
 */
export async function listTeacherCourses(accessToken: string): Promise<classroom_v1.Schema$Course[]> {
  const classroom = getClassroomClient(accessToken);
  const res = await classroom.courses.list({
    teacherId: 'me',
    courseStates: ['ACTIVE'],
  });
  return res.data.courses || [];
}

/**
 * Get details for a specific course.
 */
export async function getCourse(accessToken: string, courseId: string): Promise<classroom_v1.Schema$Course> {
  if (!courseId) throw new Error('[Classroom Client] courseId is required.');
  const classroom = getClassroomClient(accessToken);
  const res = await classroom.courses.get({ id: courseId });
  return res.data;
}

/**
 * List coursework items for a course.
 */
export async function listCourseWork(accessToken: string, courseId: string): Promise<classroom_v1.Schema$CourseWork[]> {
  if (!courseId) throw new Error('[Classroom Client] courseId is required.');
  const classroom = getClassroomClient(accessToken);
  const res = await classroom.courses.courseWork.list({ courseId });
  return res.data.courseWork || [];
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
  const classroom = getClassroomClient(accessToken);
  const res = await classroom.courses.courseWork.get({
    courseId,
    id: courseWorkId,
  });
  return res.data;
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

  const created = await classroom.courses.courseWork.create({
    courseId,
    requestBody: newCourseWork,
  });

  return created.data;
}

/**
 * Fetch all enrolled students for a course.
 */
export async function listCourseStudents(
  accessToken: string,
  courseId: string
): Promise<classroom_v1.Schema$Student[]> {
  if (!courseId) throw new Error('[Classroom Client] courseId is required.');
  const classroom = getClassroomClient(accessToken);
  const students: classroom_v1.Schema$Student[] = [];
  let pageToken: string | undefined;

  do {
    const res = await classroom.courses.students.list({
      courseId,
      pageToken,
    });
    if (res.data.students) {
      students.push(...res.data.students);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return students;
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
  const classroom = getClassroomClient(accessToken);
  const submissions: classroom_v1.Schema$StudentSubmission[] = [];
  let pageToken: string | undefined;

  do {
    const res = await classroom.courses.courseWork.studentSubmissions.list({
      courseId,
      courseWorkId,
      pageToken,
    });
    if (res.data.studentSubmissions) {
      submissions.push(...res.data.studentSubmissions);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return submissions;
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
      const lowerTitle = title.toLowerCase();
      const altLink = (file.alternateLink || '').toLowerCase();

      if (lowerTitle.endsWith('.doc') || lowerTitle.endsWith('.docx') || altLink.includes('document')) {
        fileType = 'GOOGLE_DOC';
      } else if (lowerTitle.endsWith('.ppt') || lowerTitle.endsWith('.pptx') || altLink.includes('presentation')) {
        fileType = 'GOOGLE_SLIDES';
      } else if (lowerTitle.endsWith('.xls') || lowerTitle.endsWith('.xlsx') || lowerTitle.endsWith('.csv') || altLink.includes('spreadsheets')) {
        fileType = 'GOOGLE_SHEETS';
      } else if (
        lowerTitle.endsWith('.py') ||
        lowerTitle.endsWith('.js') ||
        lowerTitle.endsWith('.ts') ||
        lowerTitle.endsWith('.java') ||
        lowerTitle.endsWith('.cpp') ||
        lowerTitle.endsWith('.html') ||
        lowerTitle.endsWith('.css') ||
        lowerTitle.endsWith('.json') ||
        lowerTitle.endsWith('.md')
      ) {
        fileType = 'CODE';
      } else if (lowerTitle.endsWith('.png') || lowerTitle.endsWith('.jpg') || lowerTitle.endsWith('.jpeg') || lowerTitle.endsWith('.webp')) {
        fileType = 'IMAGE';
      } else if (lowerTitle.endsWith('.pdf')) {
        fileType = 'PDF';
      } else if (lowerTitle.endsWith('.txt')) {
        fileType = 'TEXT';
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
 * Attempts to read any existing rubric from Google Classroom's `courses.courseWork.rubrics` resource.
 * Note: Writing/modifying rubrics via Classroom API is blocked by Google's Education Plus license requirement
 * (`@UserIneligibleToModifyRubrics`), so Classroom rubrics are read-only and synced into Firestore when present.
 */
export async function fetchCourseWorkRubricFromClassroom(
  accessToken: string,
  courseId: string,
  courseWorkId: string
): Promise<{
  id: string;
  title: string;
  criteria: Array<{ id: string; title: string; description: string; maxPoints: number }>;
  updatedAt: string;
} | null> {
  if (!courseId || !courseWorkId) return null;
  try {
    const res = await fetch(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}/rubrics`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    const firstRubric = data?.rubrics?.[0];
    if (!firstRubric || !Array.isArray(firstRubric.criteria) || firstRubric.criteria.length === 0) {
      return null;
    }

    const criteria = firstRubric.criteria.map((c: any, idx: number) => {
      const levels = Array.isArray(c.levels) ? c.levels : [];
      const maxPoints = levels.reduce((max: number, lvl: any) => Math.max(max, Number(lvl.points) || 0), 0);
      return {
        id: c.id || `crit_${idx + 1}`,
        title: c.title || `Criterion ${idx + 1}`,
        description: c.description || '',
        maxPoints,
      };
    });

    return {
      id: firstRubric.id || `classroom_rubric_${courseWorkId}`,
      title: 'Classroom Rubric',
      criteria,
      updatedAt: firstRubric.updateTime || firstRubric.creationTime || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetches the complete live Classroom workspace (Course + CourseWork + Roster + Submissions + Classroom Rubric if present)
 * directly from the Google Classroom API in parallel.
 */
export async function fetchLiveWorkspaceFromClassroom(
  accessToken: string,
  courseId: string,
  courseWorkId: string
) {
  const [course, coursework, students, rawSubmissions, classroomRubric] = await Promise.all([
    getCourse(accessToken, courseId),
    getCourseWork(accessToken, courseId, courseWorkId),
    listCourseStudents(accessToken, courseId),
    listCourseWorkSubmissions(accessToken, courseId, courseWorkId),
    fetchCourseWorkRubricFromClassroom(accessToken, courseId, courseWorkId),
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
    ...(classroomRubric ? { rubric: classroomRubric } : {}),
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

  const res = await classroom.courses.courseWork.studentSubmissions.patch({
    courseId,
    courseWorkId,
    id: submissionId,
    updateMask: updateMaskParts.join(','),
    requestBody,
  });

  return res.data;
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
  const res = await classroom.courses.courseWork.studentSubmissions.return({
    courseId,
    courseWorkId,
    id: submissionId,
    requestBody: {},
  });
  return res.data;
}
