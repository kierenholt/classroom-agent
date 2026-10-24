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

export interface CreateCourseWorkInput {
  title: string;
  description?: string;
  maxPoints?: number;
  dueDate?: string; // YYYY-MM-DD
  state?: 'PUBLISHED' | 'DRAFT';
}

export interface UpdateCourseWorkInput {
  title?: string;
  description?: string;
  maxPoints?: number;
  dueDate?: string; // YYYY-MM-DD
}

/**
 * Creates a new coursework assignment in Google Classroom under the application's OAuth client ID.
 * Coursework created via this endpoint has associatedWithDeveloper=true, enabling full grade write-back and return.
 */
export async function createCourseWork(
  accessToken: string,
  courseId: string,
  input: CreateCourseWorkInput
): Promise<classroom_v1.Schema$CourseWork> {
  if (!courseId || !courseId.trim()) {
    throw new Error('[Classroom Client] courseId is required to create coursework. Fail-fast enabled.');
  }
  if (!input?.title || !input.title.trim()) {
    throw new Error('[Classroom Client] Assignment title is required to create coursework. Fail-fast enabled.');
  }

  const classroom = getClassroomClient(accessToken);
  const parsedMaxPoints =
    input.maxPoints !== undefined && input.maxPoints !== null && !Number.isNaN(Number(input.maxPoints))
      ? Number(input.maxPoints)
      : 100;

  const requestBody: classroom_v1.Schema$CourseWork = {
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    state: input.state || 'PUBLISHED',
    workType: 'ASSIGNMENT',
    maxPoints: parsedMaxPoints,
    submissionModificationMode: 'MODIFIABLE_UNTIL_TURNED_IN',
  };

  if (input.dueDate && input.dueDate.trim()) {
    const match = input.dueDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new Error(`[Classroom Client] Invalid dueDate format "${input.dueDate}". Expected YYYY-MM-DD.`);
    }
    requestBody.dueDate = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
    requestBody.dueTime = {
      hours: 23,
      minutes: 59,
    };
  }

  const created = await classroom.courses.courseWork.create({
    courseId,
    requestBody,
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
  profile?: { name: string; email?: string | null }
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

  const effectiveState: 'CREATED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED_BY_STUDENT' =
    sub.state === 'RETURNED'
      ? 'RETURNED'
      : sub.state === 'TURNED_IN' || attachments.length > 0
      ? 'TURNED_IN'
      : sub.state === 'RECLAIMED_BY_STUDENT'
      ? 'RECLAIMED_BY_STUDENT'
      : 'CREATED';

  return {
    studentId,
    submissionId: sub.id || studentId,
    studentName: profile?.name || `Student ${studentId.slice(0, 6)}`,
    studentEmail: profile?.email || undefined,
    state: effectiveState,
    late: sub.late || false,
    attachments,
    draftGrade: sub.draftGrade ?? undefined,
    assignedGrade: sub.assignedGrade ?? undefined,
    rubricBreakdown: [],
    overallFeedback: '',
    comments: [],
    classroomSyncStatus: isReturned ? 'RETURNED' : hasDraft ? 'DRAFT' : 'UNSAVED',
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
      criteria,
      updatedAt: firstRubric.updateTime || firstRubric.creationTime || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function computeRubricTotalPoints(rubric: any): number {
  if (!rubric || !Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
    return 0;
  }
  return rubric.criteria.reduce((sum: number, c: any) => sum + (Number(c.maxPoints) || 0), 0);
}

/**
 * Updates the maxPoints of a coursework item in Google Classroom via courses.courseWork.patch.
 */
export async function patchCourseWorkMaxPoints(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
  maxPoints: number
): Promise<classroom_v1.Schema$CourseWork | null> {
  if (!courseId || !courseWorkId || typeof maxPoints !== 'number' || Number.isNaN(maxPoints) || maxPoints <= 0) {
    return null;
  }
  const classroom = getClassroomClient(accessToken);
  const res = await classroom.courses.courseWork.patch({
    courseId,
    id: courseWorkId,
    updateMask: 'maxPoints',
    requestBody: {
      maxPoints,
    },
  });
  return res.data;
}

/**
 * Updates an existing coursework assignment in Google Classroom via courses.courseWork.patch.
 */
export async function patchCourseWork(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
  input: UpdateCourseWorkInput
): Promise<classroom_v1.Schema$CourseWork> {
  if (!courseId || !courseId.trim()) {
    throw new Error('[Classroom Client] courseId is required to update coursework. Fail-fast enabled.');
  }
  if (!courseWorkId || !courseWorkId.trim()) {
    throw new Error('[Classroom Client] courseWorkId is required to update coursework. Fail-fast enabled.');
  }

  const classroom = getClassroomClient(accessToken);
  const updateMaskParts: string[] = [];
  const requestBody: classroom_v1.Schema$CourseWork = {};

  if (input.title !== undefined) {
    if (!input.title.trim()) {
      throw new Error('[Classroom Client] Assignment title cannot be empty. Fail-fast enabled.');
    }
    requestBody.title = input.title.trim();
    updateMaskParts.push('title');
  }

  if (input.description !== undefined) {
    requestBody.description = input.description.trim();
    updateMaskParts.push('description');
  }

  if (input.maxPoints !== undefined) {
    const parsedPoints = Number(input.maxPoints);
    if (Number.isNaN(parsedPoints) || parsedPoints < 0) {
      throw new Error('[Classroom Client] maxPoints must be a non-negative number. Fail-fast enabled.');
    }
    requestBody.maxPoints = parsedPoints;
    updateMaskParts.push('maxPoints');
  }

  if (input.dueDate !== undefined) {
    const trimmedDate = input.dueDate ? input.dueDate.trim() : '';
    if (trimmedDate) {
      const match = trimmedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        throw new Error(`[Classroom Client] Invalid dueDate format "${input.dueDate}". Expected YYYY-MM-DD.`);
      }
      requestBody.dueDate = {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
      requestBody.dueTime = {
        hours: 23,
        minutes: 59,
      };
      updateMaskParts.push('dueDate', 'dueTime');
    } else {
      updateMaskParts.push('dueDate', 'dueTime');
    }
  }

  if (updateMaskParts.length === 0) {
    throw new Error('[Classroom Client] At least one field must be provided to update coursework. Fail-fast enabled.');
  }

  const res = await classroom.courses.courseWork.patch({
    courseId,
    id: courseWorkId,
    updateMask: updateMaskParts.join(','),
    requestBody,
  });

  return res.data;
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

  const studentMap = new Map<string, { name: string; email?: string | null }>();
  for (const st of students) {
    if (st.userId) {
      studentMap.set(st.userId, {
        name: st.profile?.name?.fullName || `Student ${st.userId.slice(0, 6)}`,
        email: st.profile?.emailAddress,
      });
    }
  }

  const submissions = rawSubmissions.map((sub) =>
    mapLiveClassroomSubmission(sub, studentMap.get(sub.userId || ''))
  );

  const turnedInCount = submissions.filter((s) => s.state === 'TURNED_IN').length;
  const returnedCount = submissions.filter((s) => s.state === 'RETURNED').length;
  const draftGradedCount = submissions.filter((s) => s.draftGrade !== undefined && s.state !== 'RETURNED').length;

  const classroomRubricPoints = computeRubricTotalPoints(classroomRubric);
  const assignmentId = `${courseId}_${courseWorkId}`;
  const assignment = {
    id: assignmentId,
    courseId,
    courseName: course.name || 'Classroom Course',
    courseWorkId,
    title: coursework.title || 'Classroom Assignment',
    description: coursework.description || '',
    maxPoints: classroomRubricPoints > 0 ? classroomRubricPoints : coursework.maxPoints || 100,
    dueDate: coursework.dueDate
      ? `${coursework.dueDate.year}-${coursework.dueDate.month}-${coursework.dueDate.day}`
      : undefined,
    state: (coursework.state || 'PUBLISHED') as 'PUBLISHED' | 'DRAFT',
    apiWriteBackEligible: coursework.associatedWithDeveloper || false,
    alternateLink: coursework.alternateLink || course.alternateLink || (courseId && courseWorkId ? `https://classroom.google.com/c/${courseId}/a/${courseWorkId}` : undefined),
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineMarkdownToHtml(text: string): string {
  let html = escapeHtml(text);
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background-color:#f3f4f6;padding:2px 4px;border-radius:3px;font-family:monospace;">$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return html;
}

/**
 * Converts Markdown feedback into structured HTML suitable for Google Docs import.
 */
export function markdownToGoogleDocHtml(markdown: string, docTitle?: string): string {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  const htmlParts: string[] = [];

  if (docTitle) {
    htmlParts.push(`<h1 style="font-family:Arial,sans-serif;color:#111827;margin-bottom:12px;">${escapeHtml(docTitle)}</h1>`);
    htmlParts.push('<hr style="border:none;border-top:1px solid #d1d5db;margin-bottom:16px;" />');
  }

  let inList: 'ul' | 'ol' | null = null;
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const closeList = () => {
    if (inList) {
      htmlParts.push(`</${inList}>`);
      inList = null;
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      closeList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLines = [];
      } else {
        inCodeBlock = false;
        htmlParts.push(
          `<pre style="background-color:#f3f4f6;padding:10px;border-radius:6px;font-family:monospace;font-size:10pt;">${escapeHtml(
            codeLines.join('\n')
          )}</pre>`
        );
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeList();
      htmlParts.push(`<h3 style="font-family:Arial,sans-serif;color:#1f2937;margin-top:14px;margin-bottom:6px;">${formatInlineMarkdownToHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      closeList();
      htmlParts.push(`<h2 style="font-family:Arial,sans-serif;color:#111827;margin-top:16px;margin-bottom:8px;">${formatInlineMarkdownToHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      closeList();
      htmlParts.push(`<h1 style="font-family:Arial,sans-serif;color:#111827;margin-top:18px;margin-bottom:10px;">${formatInlineMarkdownToHtml(trimmed.slice(2))}</h1>`);
    } else if (/^[-*]\s+/.test(trimmed)) {
      if (inList !== 'ul') {
        closeList();
        htmlParts.push('<ul style="font-family:Arial,sans-serif;margin-top:4px;margin-bottom:8px;">');
        inList = 'ul';
      }
      htmlParts.push(`<li style="margin-bottom:4px;">${formatInlineMarkdownToHtml(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (/^\d+\.\s+/.test(trimmed)) {
      if (inList !== 'ol') {
        closeList();
        htmlParts.push('<ol style="font-family:Arial,sans-serif;margin-top:4px;margin-bottom:8px;">');
        inList = 'ol';
      }
      htmlParts.push(`<li style="margin-bottom:4px;">${formatInlineMarkdownToHtml(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
    } else if (trimmed.startsWith('> ')) {
      closeList();
      htmlParts.push(
        `<blockquote style="border-left:3px solid #6366f1;padding-left:10px;color:#374151;font-style:italic;margin:8px 0;">${formatInlineMarkdownToHtml(
          trimmed.slice(2)
        )}</blockquote>`
      );
    } else {
      closeList();
      htmlParts.push(`<p style="font-family:Arial,sans-serif;line-height:1.5;margin-top:0;margin-bottom:10px;">${formatInlineMarkdownToHtml(trimmed)}</p>`);
    }
  }

  closeList();
  if (inCodeBlock && codeLines.length > 0) {
    htmlParts.push(
      `<pre style="background-color:#f3f4f6;padding:10px;border-radius:6px;font-family:monospace;font-size:10pt;">${escapeHtml(
        codeLines.join('\n')
      )}</pre>`
    );
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body style="font-family:Arial,sans-serif;font-size:11pt;color:#111827;">${htmlParts.join(
    '\n'
  )}</body></html>`;
}

/**
 * Creates a formatted Google Doc in Google Drive from Markdown feedback content.
 */
export async function createFeedbackGoogleDoc(
  accessToken: string,
  title: string,
  markdownContent: string
): Promise<{ fileId: string; webViewLink: string; title: string }> {
  if (!title || !markdownContent) {
    throw new Error('[Classroom Client] title and markdownContent are required to create a feedback Google Doc.');
  }
  const drive = getDriveClient(accessToken);
  const htmlBody = markdownToGoogleDocHtml(markdownContent, title);

  const created = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
    },
    media: {
      mimeType: 'text/html',
      body: htmlBody,
    },
    fields: 'id, name, webViewLink',
  });

  const fileId = created.data.id;
  if (!fileId) {
    throw new Error('[Classroom Client] Google Drive did not return a file ID for the feedback document.');
  }

  return {
    fileId,
    webViewLink: created.data.webViewLink || `https://docs.google.com/document/d/${fileId}/edit`,
    title: created.data.name || title,
  };
}

/**
 * Attaches a Google Drive file to a student's submission in Google Classroom via studentSubmissions.modifyAttachments.
 */
export async function attachDriveFileToSubmission(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
  submissionId: string,
  driveFileId: string
) {
  if (!courseId || !courseWorkId || !submissionId || !driveFileId) {
    throw new Error('[Classroom Client] courseId, courseWorkId, submissionId, and driveFileId are required to attach file.');
  }
  const classroom = getClassroomClient(accessToken);
  const res = await classroom.courses.courseWork.studentSubmissions.modifyAttachments({
    courseId,
    courseWorkId,
    id: submissionId,
    requestBody: {
      addAttachments: [
        {
          driveFile: {
            id: driveFileId,
          },
        },
      ],
    },
  });
  return res.data;
}
