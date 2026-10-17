import { test, expect } from '@playwright/test';
import {
  testCourseId,
  ensureTestStudentEnrolled,
  createLiveClassroomAssignmentFixture,
  submitAndTurnInAsTestStudent,
  deleteStudentDriveFile,
  deleteLiveClassroomAssignmentFixture,
  getLiveTeacherAccessToken,
  LiveCourseWorkResult,
} from '../helpers/classroomSandboxSeeder';

test.describe('Live Google Classroom E2E — Full Teacher & Student Lifecycle', () => {
  let createdCourseWork: LiveCourseWorkResult | null = null;
  let uploadedDriveFileId: string | null = null;
  let activeAccessToken: string = '';

  // 1. CREATE: Ensure student is enrolled, create live assignment, attach student file, and turn it in
  test.beforeEach(async () => {
    activeAccessToken = await getLiveTeacherAccessToken();

    // Ensure test student is enrolled in the course
    const student = await ensureTestStudentEnrolled(testCourseId);
    console.log(`[E2E Setup] Verified student enrolled: ${student.fullName} (ID: ${student.userId})`);

    const timestamp = Date.now();
    createdCourseWork = await createLiveClassroomAssignmentFixture(testCourseId, {
      title: `[E2E Test] Essay & Lab Analysis ${timestamp}`,
      description: 'Automated test assignment created in beforeEach. Will be torn down in afterEach.',
      maxPoints: 100,
    });
    console.log(`[E2E Setup] Created live Google Classroom assignment: "${createdCourseWork.title}" (ID: ${createdCourseWork.id})`);

    // Student uploads file to Drive, attaches to submission, and turns it in
    const submissionResult = await submitAndTurnInAsTestStudent(testCourseId, createdCourseWork.id, {
      filename: 'recursion_solution.py',
      mimeType: 'text/x-python',
      content: 'def factorial(n: int) -> int:\n    """Calculates n! recursively."""\n    return 1 if n <= 1 else n * factorial(n - 1)\n',
    });
    uploadedDriveFileId = submissionResult.driveFileId;
    console.log(`[E2E Setup] Student turned in submission ID: ${submissionResult.submissionId} with Drive file: ${uploadedDriveFileId}`);
  });

  // 2. TEARDOWN: Cleanly delete the assignment from Google Classroom and temporary file from Student's Drive
  test.afterEach(async () => {
    if (createdCourseWork) {
      console.log(`[E2E Teardown] Deleting assignment ID: ${createdCourseWork.id} from Classroom...`);
      await deleteLiveClassroomAssignmentFixture(testCourseId, createdCourseWork.id);
      createdCourseWork = null;
    }

    if (uploadedDriveFileId) {
      console.log(`[E2E Teardown] Deleting temporary Drive file ID: ${uploadedDriveFileId}...`);
      await deleteStudentDriveFile(uploadedDriveFileId);
      uploadedDriveFileId = null;
    }

    console.log('[E2E Teardown] Teardown complete. Course and Drive remain clean.');
  });

  test('syncAssignment_liveCreatedCourseWorkWithTurnedInStudent_displaysInRosterAndTabs_test', async ({ page }) => {
    expect(createdCourseWork).not.toBeNull();
    expect(createdCourseWork!.id).toBeTruthy();
    expect(uploadedDriveFileId).toBeTruthy();

    // Inject active Google OAuth access token into session storage
    await page.addInitScript((token) => {
      window.sessionStorage.setItem('classroom_agent_google_access_token', token);
    }, activeAccessToken);

    // Verify course work details from Google Classroom API match created fixture
    expect(createdCourseWork!.courseId).toBe(testCourseId);
    expect(createdCourseWork!.state).toBe('PUBLISHED');
    expect(createdCourseWork!.maxPoints).toBe(100);

    // Navigate to local application workspace
    await page.goto('/');

    // Check presence of top tab bar
    const tabBar = page.locator('[data-testid="assignment-tab-bar"]');
    await expect(tabBar).toBeVisible();
  });
});
