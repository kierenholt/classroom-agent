import { test, expect } from '../helpers/logHelper';
import {
  seedTestAssignment,
  seedTestSubmission,
  cleanupTestAssignment,
  seedTestChatMessage,
  seedTestUserCredits,
  deleteTestUser,
} from '../helpers/testSeeder';

const TEST_ASSIGNMENT_ID = 'test_course_101_assignment_999';
const TEST_STUDENT_ID = 'student_test_user_42';

test.describe('Classroom Agent - Workspace and Agent Co-Pilot Tests', () => {
  let sharedEligibleCourseWorkId: string | null = null;
  let sharedCourseId: string | null = null;

  test.beforeAll(async () => {
    try {
      const {
        testCourseId,
        createLiveClassroomAssignmentFixture,
        sweepOrphanedTestAssignments,
      } = await import('../helpers/classroomSandboxSeeder');
      sharedCourseId = testCourseId;
      await sweepOrphanedTestAssignments(testCourseId);
      const created = await createLiveClassroomAssignmentFixture(testCourseId, {
        title: `[E2E Test] Eligible Assignment ${Date.now()}`,
        description: 'Eligible Classroom Agent assignment for workspace E2E suite.',
        maxPoints: 100,
      });
      sharedEligibleCourseWorkId = created.id;
    } catch {
      sharedEligibleCourseWorkId = null;
    }
  });

  test.afterAll(async () => {
    if (sharedCourseId && sharedEligibleCourseWorkId) {
      try {
        const { deleteLiveClassroomAssignmentFixture } = await import('../helpers/classroomSandboxSeeder');
        await deleteLiveClassroomAssignmentFixture(sharedCourseId, sharedEligibleCourseWorkId);
      } catch {
        // ignore cleanup failure
      }
    }
  });

  test.beforeEach(async () => {
    // Seed test fixtures in local Firestore emulator
    await seedTestAssignment(TEST_ASSIGNMENT_ID, {
      courseId: 'test_course_101',
      courseName: 'CS 101: Computer Science',
      courseWorkId: 'assignment_999',
      title: 'Python Recursion Lab',
      description: 'Implement recursive binary search and factorial functions.',
      maxPoints: 100,
      state: 'PUBLISHED',
      apiWriteBackEligible: true,
      rubric: {
        id: 'rubric_cs101_rec',
        title: 'Recursion Rubric',
        criteria: [
          { id: 'crit_correctness', title: 'Code Correctness', description: 'Passes all recursive test cases', maxPoints: 50 },
          { id: 'crit_style', title: 'Code Style & Docstrings', description: 'Clean PEP8 style and comments', maxPoints: 50 },
        ],
      },
    });

    await seedTestSubmission(TEST_ASSIGNMENT_ID, TEST_STUDENT_ID, {
      submissionId: 'sub_test_42',
      studentName: 'Alex Mercer',
      state: 'TURNED_IN',
      late: false,
      overallFeedback: '',
      classroomSyncStatus: 'UNSAVED',
      attachments: [
        {
          id: 'att_code_1',
          title: 'solution.py',
          type: 'CODE',
          contentPreview: 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\n',
        },
      ],
      rubricBreakdown: [],
      comments: [],
    });
  });

  test.afterEach(async () => {
    // Clean up all seeded test fixtures from local Firestore emulator
    await cleanupTestAssignment(TEST_ASSIGNMENT_ID, [TEST_STUDENT_ID]);
  });

  test('renderWorkspace_unauthenticatedUser_showsGoogleSignInPrompt_test', async ({ page }) => {
    await page.goto('/');

    // When unauthenticated, the application presents the marketing landing page with official Google Classroom sign-in
    await expect(page.getByTestId('marketing-landing-page')).toBeVisible();
    const signInButton = page.locator('button:has-text("Sign in with Google Classroom")');
    await expect(signInButton).toBeVisible();
    await expect(page.getByTestId('navbar-google-signin-button')).toBeVisible();
    await expect(page.getByTestId('footer-privacy-link')).toBeVisible();
    await expect(page.getByTestId('footer-terms-link')).toBeVisible();

    // Navigate to Privacy Policy via link and verify Google API Limited Use disclosure
    await page.getByTestId('footer-privacy-link').click();
    await expect(page.getByTestId('privacy-policy-page')).toBeVisible();
    await expect(page.getByTestId('google-limited-use-disclosure')).toContainText(
      'Google API Services User Data Policy'
    );

    // Navigate to Terms of Service and back to home
    await page.getByTestId('privacy-to-terms-link').click();
    await expect(page.getByTestId('terms-of-service-page')).toBeVisible();
    await page.getByTestId('terms-back-home-link').click();
    await expect(page.getByTestId('marketing-landing-page')).toBeVisible();
  });

  test('mountWorkspace_authenticatedTeacherWithAssignment_rendersThreeZonesAndChatPane_test', async ({ page }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch {
      googleToken = '';
      customToken = '';
    }

    // Inject session storage credentials into browser context
    await page.addInitScript(({ gToken, cToken }) => {
      if (gToken) {
        window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
      }
      if (cToken) {
        window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
      }
    }, { gToken: googleToken, cToken: customToken });

    await page.goto('/');

    // Verify top tab bar existence and initial empty workspace state
    await expect(page.locator('[data-testid="assignment-tab-bar"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="empty-workspace-state"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeHidden();

    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await expect(newAssignmentTabBtn).toContainText('Assignment');

    // Click "+ Assignment" button to open the modal
    await newAssignmentTabBtn.click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="class-picker-section"]')).toBeVisible();
    // Before selecting a class, the assignment picker section is hidden and legacy footer Cancel/OK buttons are removed
    await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="assignment-picker-ok-button"]')).toBeHidden();
    await expect(page.locator('[data-testid="assignment-picker-cancel-button"]')).toBeHidden();
  });

  test('preloadAssignments_teacherAuthenticated_preloadsCoursesAndAssignmentsForInstantModalDisplay_test', async ({
    page,
  }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch {
      googleToken = '';
      customToken = '';
    }

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });

    // Wait for the background preload request to complete
    await page.waitForResponse(
      (res) => res.url().includes('/classroom/preload') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);

    // Click "+ Assignment" button
    const startTime = Date.now();
    await newAssignmentTabBtn.click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 5000 });

    // Ensure courses are immediately visible with NO "Loading classes..." spinner delay
    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 2000 });
    await expect(page.locator('text=Loading classes...')).toBeHidden();

    // Select the first course
    await courseButtons.first().click();

    // Ensure assignments are immediately visible with NO "Loading assignments from Classroom..." spinner delay
    await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('text=Loading assignments from Classroom...')).toBeHidden();

    const elapsed = Date.now() - startTime;
    console.log(`[Instant Assignment Picker] Modal open + course select elapsed: ${elapsed}ms`);
  });

  test('renderAgentChatMessage_markdownFormattedResponse_rendersHeadingsListsBlockquotesAndFormattedElements_test', async ({
    page,
  }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch {
      googleToken = '';
      customToken = '';
    }

    // Inject session storage credentials into browser context
    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    // Click "+ Assignment" button to open the modal
    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await newAssignmentTabBtn.click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

    // Find an active course that contains eligible coursework and click its Open button
    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();
    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      await courseButtons.nth(i).click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      try {
        await expect(openBtn).toBeVisible({ timeout: 5000 });
        await openBtn.click();
        opened = true;
        break;
      } catch {
        // Continue to check next course
      }
    }
    expect(opened).toBe(true);
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeHidden();

    // Verify the assignment tab and chat window are mounted
    await expect(page.locator('[data-testid="chat-window"]')).toBeVisible({ timeout: 15000 });

    const openTab = page
      .locator('[data-testid^="assignment-tab-"]:not([data-testid="assignment-tab-bar"])')
      .first();
    await expect(openTab).toBeVisible({ timeout: 15000 });
    const tabIdAttr = await openTab.getAttribute('data-testid');
    const assignmentId = tabIdAttr!.replace('assignment-tab-', '');

    const markdownMessage = `I have reviewed and graded the submission for **Kieren Holt**.

---

### **Evaluation Summary**

* **Student:** Kieren Holt (\`103894037562787398539\`)
* **Submission Reviewed:** Attached Google Doc (*"Kieren Holt - test assignmnet made in GC"*)
* **Content:** \`"JUST SOME STUFF WRITTEN BY TEACHOMETER ACCOUNT"\`
* **Turn-in Status:** Turned in (on time)

---

### **Grading &amp; Rubric Breakdown**

* **Draft Grade:** **50 / 100**
* **Criterion Scores:**
  * **Overall Evaluation &amp; Completion:** **50 / 100**
    * *Justification:* The document was submitted on time with the proper file attachment format. However, it contains only a single line of placeholder test text rather than substantive responses or work.

---

### **Feedback Provided**

&gt; *"The document was successfully submitted on time; however, it currently only contains placeholder text (\`"JUST SOME STUFF WRITTEN BY TEACHOMETER ACCOUNT"\`). If this was intended as a test submission, the workflow is functioning properly. For a final academic submission, please provide the complete, detailed response addressing the assignment objectives."*

*(Note: The grade and evaluation breakdown have been saved to the grading system sidecar.)*`;

    const messageId = `test_md_msg_${Date.now()}`;
    await seedTestChatMessage(assignmentId, messageId, {
      sender: 'agent',
      content: markdownMessage,
    });

    try {
      // Assert markdown-content container renders in the chat window for the seeded bubble
      const chatBubble = page.locator(`[data-testid="chat-bubble-${messageId}"]`);
      await expect(chatBubble).toBeVisible({ timeout: 15000 });
      const mdContent = chatBubble.locator('[data-testid="markdown-content"]');
      await expect(mdContent).toBeVisible({ timeout: 15000 });

      // Assert headings render as h3 elements
      const evalHeading = mdContent.locator('h3', { hasText: 'Evaluation Summary' });
      await expect(evalHeading).toBeVisible();

      // Assert HTML entity &amp; was decoded and rendered in heading
      const rubricHeading = mdContent.locator('h3', { hasText: 'Grading & Rubric Breakdown' });
      await expect(rubricHeading).toBeVisible();

      // Assert strong elements
      await expect(mdContent.locator('strong', { hasText: 'Kieren Holt' }).first()).toBeVisible();
      await expect(mdContent.locator('strong', { hasText: 'Student:' })).toBeVisible();

      // Assert inline code element
      await expect(mdContent.locator('code', { hasText: '103894037562787398539' })).toBeVisible();

      // Assert blockquote rendered
      const blockquote = mdContent.locator('blockquote');
      await expect(blockquote).toBeVisible();
      await expect(blockquote).toContainText('The document was successfully submitted on time');

      // Assert horizontal rules
      await expect(mdContent.locator('hr').first()).toBeVisible();

      // Assert lists and list items
      await expect(mdContent.locator('ul').first()).toBeVisible();
      await expect(mdContent.locator('li', { hasText: 'Turn-in Status:' })).toBeVisible();
    } finally {
      // Clean up the seeded test chat message
      await cleanupTestAssignment(assignmentId);
    }
  });

  test('rubricMarkingZone_studentSelected_rendersRubricCriteriaWithoutCommentsOrOverallFeedback_test', async ({
    page,
  }) => {
    page.on('pageerror', (err) => console.error('[PAGE ERROR]', err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[BROWSER CONSOLE ERROR]', msg.text());
    });
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch (err) {
      console.error('[TEST TOKEN ERROR]', err);
      googleToken = '';
      customToken = '';
    }

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await newAssignmentTabBtn.click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();
    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      await courseButtons.nth(i).click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      try {
        await expect(openBtn).toBeVisible({ timeout: 5000 });
        await openBtn.click();
        opened = true;
        break;
      } catch {
        // Continue to check next course
      }
    }
    expect(opened).toBe(true);
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeHidden();

    // Wait for the workspace to load
    await expect(page.locator('[data-testid="student-roster-list"]')).toBeVisible({ timeout: 15000 });

    // Select the first student row
    const firstStudent = page.locator('[data-testid^="student-row-"]').first();
    await expect(firstStudent).toBeVisible({ timeout: 10000 });
    await firstStudent.click();

    // Verify attachment tab displays a file-type specific icon (e.g. Google Doc icon with #4285F4 fill)
    const attachmentTab = page.locator('[data-testid^="attachment-tab-"]').first();
    await expect(attachmentTab).toBeVisible({ timeout: 10000 });
    const tabIconSvg = attachmentTab.locator('svg').first();
    await expect(tabIconSvg).toBeVisible();
    await expect(tabIconSvg.locator('path[fill="#4285F4"]')).toBeVisible();

    // Verify Extracted Text toggle button is hidden by default (Settings modal toggle defaults to off)
    const extractedTextBtn = page.locator('[data-testid="toggle-extracted-text-button"]');
    await expect(extractedTextBtn).toBeHidden();

    // Open Settings modal via User Account menu, enable Extracted Text toggle, and verify button appears
    await page.locator('[data-testid="user-account-button"]').click();
    await page.locator('[data-testid="user-menu-settings-button"]').click();
    const settingsModal = page.locator('[data-testid="settings-modal"]');
    await expect(settingsModal).toBeVisible();
    await page.locator('[data-testid="settings-tab-advanced"]').click();
    const settingSwitch = page.locator('[data-testid="toggle-extracted-text-setting"]');
    await expect(settingSwitch).toHaveAttribute('aria-checked', 'false');
    await settingSwitch.click();
    await expect(settingSwitch).toHaveAttribute('aria-checked', 'true');
    await page.locator('[data-testid="close-settings-button"]').click();
    await expect(settingsModal).toBeHidden();

    await expect(extractedTextBtn).toBeVisible({ timeout: 15000 });

    // Turn setting back off and verify button is hidden again
    await page.locator('[data-testid="user-account-button"]').click();
    await page.locator('[data-testid="user-menu-settings-button"]').click();
    await expect(settingsModal).toBeVisible();
    await page.locator('[data-testid="settings-tab-advanced"]').click();
    await settingSwitch.click();
    await expect(settingSwitch).toHaveAttribute('aria-checked', 'false');
    await page.locator('[data-testid="close-settings-button"]').click();
    await expect(extractedTextBtn).toBeHidden();

    // Verify rubric breakdown list is visible by default (Settings modal toggle defaults to on)
    const rubricBreakdownList = page.locator('[data-testid="rubric-breakdown-list"]');
    await expect(rubricBreakdownList).toBeVisible();

    // Open Settings modal, verify rubric pane setting defaults to true, toggle it off, and verify rubric pane hides
    await page.locator('[data-testid="user-account-button"]').click();
    await page.locator('[data-testid="user-menu-settings-button"]').click();
    await expect(settingsModal).toBeVisible();
    await page.locator('[data-testid="settings-tab-display"]').click();
    const rubricSettingSwitch = page.locator('[data-testid="toggle-rubric-pane-setting"]');
    await expect(rubricSettingSwitch).toHaveAttribute('aria-checked', 'true');
    await rubricSettingSwitch.click();
    await expect(rubricSettingSwitch).toHaveAttribute('aria-checked', 'false');
    await page.locator('[data-testid="close-settings-button"]').click();
    await expect(settingsModal).toBeHidden();

    await expect(rubricBreakdownList).toBeHidden();

    // Re-open Settings modal, toggle rubric pane setting back on, and verify rubric pane appears again
    await page.locator('[data-testid="user-account-button"]').click();
    await page.locator('[data-testid="user-menu-settings-button"]').click();
    await expect(settingsModal).toBeVisible();
    await page.locator('[data-testid="settings-tab-display"]').click();
    await rubricSettingSwitch.click();
    await expect(rubricSettingSwitch).toHaveAttribute('aria-checked', 'true');
    await page.locator('[data-testid="close-settings-button"]').click();
    await expect(rubricBreakdownList).toBeVisible();
    await expect(page.locator('[data-testid="overall-feedback-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="overall-feedback-input"]')).toBeHidden();
    await expect(page.locator('[data-testid="submission-comments-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="submission-comment-input"]')).toBeHidden();
  });

  test('editRubric_activeAssignment_opensModalAndPersistsUpdatedCriteria_test', async ({
    page,
  }) => {
    page.on('pageerror', (err) => console.error('[PAGE ERROR]', err.message));
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch (err) {
      console.error('[TEST TOKEN ERROR]', err);
      googleToken = '';
      customToken = '';
    }

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await newAssignmentTabBtn.click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();
    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      await courseButtons.nth(i).click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      try {
        await expect(openBtn).toBeVisible({ timeout: 5000 });
        await openBtn.click();
        opened = true;
        break;
      } catch {
        // Continue
      }
    }
    expect(opened).toBe(true);
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeHidden();

    // Wait for the workspace to load
    await expect(page.locator('[data-testid="student-roster-list"]')).toBeVisible({ timeout: 15000 });

    // Select the first student row
    const firstStudent = page.locator('[data-testid^="student-row-"]').first();
    await expect(firstStudent).toBeVisible({ timeout: 10000 });
    await firstStudent.click();

    // Verify rubric pane and either edit-rubric-button or create-rubric-button
    const editBtn = page.locator('[data-testid="edit-rubric-button"]');
    const createBtn = page.locator('[data-testid="create-rubric-button"]');
    await expect(editBtn.or(createBtn)).toBeVisible({ timeout: 10000 });

    if (await editBtn.isVisible()) {
      await editBtn.click();
    } else {
      await createBtn.click();
    }

    const rubricModal = page.locator('[data-testid="rubric-edit-modal"]');
    await expect(rubricModal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="rubric-title-input"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="rubric-total-points"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-criterion-button"]')).toBeVisible();

    // Add a new criterion
    const initialCount = await page.locator('[data-testid^="rubric-criterion-card-"]').count();
    await page.locator('[data-testid="add-criterion-button"]').click();
    await expect(page.locator(`[data-testid="rubric-criterion-card-${initialCount}"]`)).toBeVisible();

    // Fill in criterion details
    await page.locator(`[data-testid="criterion-title-input-${initialCount}"]`).fill('Test Analysis Depth');
    await page.locator(`[data-testid="criterion-points-input-${initialCount}"]`).fill('25');
    await page.locator(`[data-testid="criterion-desc-input-${initialCount}"]`).fill('Evaluates rigorous analytical reasoning');

    // Save rubric
    await page.locator('[data-testid="save-rubric-modal-button"]').click();
    await expect(rubricModal).toBeHidden({ timeout: 15000 });

    // Verify the rubric criteria breakdown in workspace displays the newly added criterion
    await expect(page.locator('[data-testid="rubric-breakdown-list"]')).toContainText('Test Analysis Depth', { timeout: 15000 });
  });

  test('clickAccountName_authenticatedUser_togglesUserPopupMenuWithSignOutButton_test', async ({ page }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch {
      googleToken = '';
      customToken = '';
    }

    await page.addInitScript(({ gToken, cToken }) => {
      if (gToken) {
        window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
      }
      if (cToken) {
        window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
      }
    }, { gToken: googleToken, cToken: customToken });

    await page.goto('/');

    await expect(page.locator('[data-testid="assignment-tab-bar"]')).toBeVisible({ timeout: 15000 });

    // Menu should be initially hidden
    const userMenu = page.locator('[data-testid="user-account-menu"]');
    await expect(userMenu).toBeHidden();

    // Account button should be visible
    const accountBtn = page.locator('[data-testid="user-account-button"]');
    await expect(accountBtn).toBeVisible({ timeout: 10000 });

    // Click on the account name/button to open popup
    await accountBtn.click();
    await expect(userMenu).toBeVisible();

    // Verify Sign Out button is visible inside the popup menu
    const signOutBtn = page.locator('[data-testid="sign-out-button"]');
    await expect(signOutBtn).toBeVisible();
    await expect(signOutBtn).toHaveAttribute('title', 'Sign Out');
    await expect(signOutBtn).toContainText('Sign Out');

    // Click outside to dismiss popup
    await page.locator('[data-testid="assignment-tab-bar"]').click({ position: { x: 50, y: 10 } });
    await expect(userMenu).toBeHidden();
  });

  test('clickStudentListItem_anywhereOnRow_togglesCheckboxAndSelectsStudent_test', async ({ page }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch {
      googleToken = '';
      customToken = '';
    }

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await newAssignmentTabBtn.click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();
    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      await courseButtons.nth(i).click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      try {
        await expect(openBtn).toBeVisible({ timeout: 5000 });
        await openBtn.click();
        opened = true;
        break;
      } catch {
        // Continue to check next course
      }
    }
    expect(opened).toBe(true);
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeHidden();

    // Wait for the workspace roster to load
    await expect(page.locator('[data-testid="student-roster-list"]')).toBeVisible({ timeout: 15000 });

    const firstStudentRow = page.locator('[data-testid^="student-row-"]').first();
    await expect(firstStudentRow).toBeVisible({ timeout: 10000 });
    const studentCheckbox = firstStudentRow.locator('input[type="checkbox"]');

    // Initially, the student checkbox is unchecked, Return Selected is disabled, and Return All is enabled
    await expect(studentCheckbox).not.toBeChecked();
    await expect(page.locator('[data-testid="return-submission-button"]')).toBeDisabled();
    await expect(page.locator('[data-testid="return-all-submissions-button"]')).toBeEnabled();

    // 1. Click anywhere on the student row (e.g. on the row container) -> toggles checkbox to checked
    await firstStudentRow.click();
    await expect(studentCheckbox).toBeChecked();
    await expect(page.locator('[data-testid="return-submission-button"]')).toBeEnabled();

    // 2. Click the row again -> toggles checkbox to unchecked
    await firstStudentRow.click();
    await expect(studentCheckbox).not.toBeChecked();
    await expect(page.locator('[data-testid="return-submission-button"]')).toBeDisabled();

    // 3. Click directly on the checkbox -> toggles checkbox to checked
    await studentCheckbox.click();
    await expect(studentCheckbox).toBeChecked();
    await expect(page.locator('[data-testid="return-submission-button"]')).toBeEnabled();

    // 4. Click directly on the checkbox again -> toggles checkbox to unchecked
    await studentCheckbox.click();
    await expect(studentCheckbox).not.toBeChecked();
    await expect(page.locator('[data-testid="return-submission-button"]')).toBeDisabled();
  });

  test('openClassroomLink_workspaceMounted_rendersGoogleClassroomLinksWithValidUrl_test', async ({ page }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch {
      googleToken = '';
      customToken = '';
    }

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await newAssignmentTabBtn.click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();
    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      await courseButtons.nth(i).click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      try {
        await expect(openBtn).toBeVisible({ timeout: 5000 });
        await openBtn.click();
        opened = true;
        break;
      } catch {
        // Continue to check next course
      }
    }
    expect(opened).toBe(true);
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeHidden();

    // Wait for the workspace roster to load
    await expect(page.locator('[data-testid="student-roster-list"]')).toBeVisible({ timeout: 15000 });

    // Verify Google Classroom link button
    const classroomLink = page.locator('[data-testid="open-classroom-link"]');
    await expect(classroomLink).toBeVisible();
    await expect(classroomLink).toHaveAttribute('target', '_blank');
    await expect(classroomLink).toHaveAttribute('rel', 'noopener noreferrer');
    const href = await classroomLink.getAttribute('href');
    expect(href).toMatch(/classroom\.google\.com/);

    // Verify sync, view, and edit buttons in the assignment header
    const syncBtn = page.locator('[data-testid="sync-classroom-button"]');
    await expect(syncBtn).toBeVisible();

    const viewBtn = page.locator('[data-testid="view-assignment-button"]');
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();

    // Verify view assignment modal appears with rendered markdown
    const viewModal = page.locator('[data-testid="view-assignment-modal"]');
    await expect(viewModal).toBeVisible();
    await expect(page.locator('[data-testid="view-assignment-title"]')).not.toBeEmpty();
    await expect(page.locator('[data-testid="view-assignment-max-points"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-assignment-description"]')).toBeVisible();

    // Close view modal
    await page.locator('[data-testid="close-view-assignment-modal"]').click();
    await expect(viewModal).toBeHidden();

    const editBtn = page.locator('[data-testid="edit-assignment-button"]');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Verify edit assignment modal appears with fields populated
    const editModal = page.locator('[data-testid="edit-assignment-modal"]');
    await expect(editModal).toBeVisible();
    await expect(page.locator('[data-testid="edit-assignment-title-input"]')).not.toBeEmpty();
    await expect(page.locator('[data-testid="edit-assignment-max-points-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="edit-assignment-description-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="edit-assignment-due-date-input"]')).toBeVisible();

    // Toggle Preview Markdown tab in edit modal
    await page.locator('[data-testid="edit-modal-preview-tab"]').click();
    await expect(page.locator('[data-testid="edit-modal-rendered-preview"]')).toBeVisible();
    await page.locator('[data-testid="edit-modal-edit-tab"]').click();
    await expect(page.locator('[data-testid="edit-assignment-title-input"]')).toBeVisible();

    // Close the edit modal
    await page.locator('[data-testid="close-edit-assignment-modal"]').click();
    await expect(editModal).toBeHidden();
  });

  test('configureFeedbackOptions_settingsModalOpened_updatesAndPersistsFeedbackPreferences_test', async ({
    page,
  }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import(
        '../helpers/classroomSandboxSeeder'
      );
      customToken = await getLiveTestTeacherCustomToken();
      googleToken = await getLiveTeacherAccessToken().catch(() => '');
    } catch {
      googleToken = '';
      customToken = '';
    }

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    // Open Settings Modal from TopTabBar user menu
    const userAccountBtn = page.locator('[data-testid="user-account-button"]');
    await expect(userAccountBtn).toBeVisible({ timeout: 15000 });
    await userAccountBtn.click();
    const userMenuSettingsBtn = page.locator('[data-testid="user-menu-settings-button"]');
    await expect(userMenuSettingsBtn).toBeVisible();
    await userMenuSettingsBtn.click();

    const settingsModal = page.locator('[data-testid="settings-modal"]');
    await expect(settingsModal).toBeVisible();
    await expect(page.locator('[data-testid="feedback-options-section"]')).toBeVisible();

    const toneSelect = page.locator('[data-testid="feedback-tone-select"]');
    const detailSelect = page.locator('[data-testid="feedback-detail-level-select"]');
    const useRubricSwitch = page.locator('[data-testid="toggle-use-rubric-feedback-setting"]');
    const nextStepsSwitch = page.locator('[data-testid="toggle-provide-next-steps-setting"]');
    const showScoresSwitch = page.locator('[data-testid="toggle-show-scores-setting"]');
    const customInstructionsInput = page.locator('[data-testid="custom-agent-instructions-input"]');

    // Verify default values
    await expect(toneSelect).toHaveValue('encouraging');
    await expect(detailSelect).toHaveValue('standard');
    await expect(useRubricSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(nextStepsSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(showScoresSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(customInstructionsInput).toHaveValue('');

    // Update each feedback option
    await toneSelect.selectOption('formal');
    await expect(toneSelect).toHaveValue('formal');

    await detailSelect.selectOption('comprehensive');
    await expect(detailSelect).toHaveValue('comprehensive');

    await useRubricSwitch.click();
    await expect(useRubricSwitch).toHaveAttribute('aria-checked', 'false');

    await nextStepsSwitch.click();
    await expect(nextStepsSwitch).toHaveAttribute('aria-checked', 'false');

    await showScoresSwitch.click();
    await expect(showScoresSwitch).toHaveAttribute('aria-checked', 'false');

    const customInstructionText = 'Deduct 5 points for missing docstrings and write in British English.';
    await customInstructionsInput.fill(customInstructionText);
    await expect(customInstructionsInput).toHaveValue(customInstructionText);

    // Verify localStorage persistence
    const storedPrefs = await page.evaluate(() => ({
      tone: window.localStorage.getItem('classroom_agent_feedback_tone'),
      detail: window.localStorage.getItem('classroom_agent_feedback_detail_level'),
      useRubric: window.localStorage.getItem('classroom_agent_feedback_use_rubric'),
      nextSteps: window.localStorage.getItem('classroom_agent_feedback_provide_next_steps'),
      showScores: window.localStorage.getItem('classroom_agent_feedback_show_scores'),
      customInstructions: window.localStorage.getItem('classroom_agent_custom_agent_instructions'),
    }));

    expect(storedPrefs).toEqual({
      tone: 'formal',
      detail: 'comprehensive',
      useRubric: 'false',
      nextSteps: 'false',
      showScores: 'false',
      customInstructions: customInstructionText,
    });

    // Close modal and re-open to verify state persists
    await page.locator('[data-testid="done-settings-button"]').click();
    await expect(settingsModal).toBeHidden();

    await userAccountBtn.click();
    await expect(userMenuSettingsBtn).toBeVisible();
    await userMenuSettingsBtn.click();
    await expect(settingsModal).toBeVisible();
    await expect(toneSelect).toHaveValue('formal');
    await expect(detailSelect).toHaveValue('comprehensive');
    await expect(useRubricSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(nextStepsSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(showScoresSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(customInstructionsInput).toHaveValue(customInstructionText);

    // Clean up localStorage back to defaults
    await page.evaluate(() => {
      window.localStorage.removeItem('classroom_agent_feedback_tone');
      window.localStorage.removeItem('classroom_agent_feedback_detail_level');
      window.localStorage.removeItem('classroom_agent_feedback_use_rubric');
      window.localStorage.removeItem('classroom_agent_feedback_provide_next_steps');
      window.localStorage.removeItem('classroom_agent_feedback_show_scores');
      window.localStorage.removeItem('classroom_agent_custom_agent_instructions');
    });
  });

  test('settingsModal_openModal_rendersWiderLayoutAndSwitchesTabs_test', async ({ page }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch {
      googleToken = '';
      customToken = '';
    }

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    // Open Settings Modal from TopTabBar user menu
    const userAccountBtn = page.locator('[data-testid="user-account-button"]');
    await expect(userAccountBtn).toBeVisible({ timeout: 15000 });
    await userAccountBtn.click();
    const userMenuSettingsBtn = page.locator('[data-testid="user-menu-settings-button"]');
    await expect(userMenuSettingsBtn).toBeVisible();
    await userMenuSettingsBtn.click();

    const settingsModal = page.locator('[data-testid="settings-modal"]');
    await expect(settingsModal).toBeVisible();

    // Verify wider layout (max-w-3xl)
    const modalDialog = settingsModal.locator('> div');
    await expect(modalDialog).toHaveClass(/max-w-3xl/);

    // Verify all 4 section tabs exist
    const feedbackTab = page.locator('[data-testid="settings-tab-feedback"]');
    const displayTab = page.locator('[data-testid="settings-tab-display"]');
    const advancedTab = page.locator('[data-testid="settings-tab-advanced"]');
    const quickActionsTab = page.locator('[data-testid="settings-tab-quick-actions"]');
    await expect(feedbackTab).toBeVisible();
    await expect(displayTab).toBeVisible();
    await expect(advancedTab).toBeVisible();
    await expect(quickActionsTab).toBeVisible();

    // By default, feedback options section is active and display/advanced/quick-actions sections are hidden
    await expect(page.locator('[data-testid="feedback-options-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="workspace-display-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="advanced-options-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="quick-actions-settings-section"]')).toBeHidden();

    // Switch to Workspace Display tab
    await displayTab.click();
    await expect(page.locator('[data-testid="workspace-display-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="feedback-options-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="advanced-options-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="quick-actions-settings-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="toggle-rubric-pane-setting"]')).toBeVisible();

    // Switch to Advanced tab and verify Show Extracted Text Toggle and Show Tool Calls settings default to off (false)
    await advancedTab.click();
    await expect(page.locator('[data-testid="advanced-options-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="workspace-display-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="feedback-options-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="quick-actions-settings-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="toggle-extracted-text-setting"]')).toBeVisible();
    const showToolCallsToggle = page.locator('[data-testid="toggle-show-tool-calls-setting"]');
    await expect(showToolCallsToggle).toBeVisible();
    await expect(showToolCallsToggle).toHaveAttribute('aria-checked', 'false');

    // Toggle Show Tool Calls on and back off to verify state and localStorage persistence
    await showToolCallsToggle.click();
    await expect(showToolCallsToggle).toHaveAttribute('aria-checked', 'true');
    await showToolCallsToggle.click();
    await expect(showToolCallsToggle).toHaveAttribute('aria-checked', 'false');

    // Switch to Quick Actions tab
    await quickActionsTab.click();
    await expect(page.locator('[data-testid="quick-actions-settings-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="advanced-options-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="workspace-display-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="feedback-options-section"]')).toBeHidden();
    const showQuickActionsToggle = page.locator('[data-testid="toggle-show-quick-actions-setting"]');
    await expect(showQuickActionsToggle).toBeVisible();
    await expect(showQuickActionsToggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-testid="add-quick-action-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="reset-quick-actions-button"]')).toBeVisible();

    // Switch back to Feedback & Grading tab
    await feedbackTab.click();
    await expect(page.locator('[data-testid="feedback-options-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="workspace-display-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="advanced-options-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="quick-actions-settings-section"]')).toBeHidden();

    // Close settings modal
    await page.locator('[data-testid="close-settings-button"]').click();
    await expect(settingsModal).toBeHidden();
  });

  test('createAssignment_classSelectedInModal_createsCourseworkInClassroomAndOpensWorkspaceTab_test', async ({
    page,
  }) => {
    const {
      getLiveTeacherAccessToken,
      getLiveTestTeacherCustomToken,
      deleteLiveClassroomAssignmentFixture,
      sweepOrphanedTestAssignments,
    } = await import('../helpers/classroomSandboxSeeder');

    const [googleToken, customToken] = await Promise.all([
      getLiveTeacherAccessToken(),
      getLiveTestTeacherCustomToken(),
    ]);

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    let createdCourseId = '';
    let createdCourseWorkId = '';

    try {
      await page.goto('/');

      const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
      await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
      await newAssignmentTabBtn.click();

      const modal = page.locator('[data-testid="assignment-picker-modal"]');
      await expect(modal).toBeVisible({ timeout: 15000 });

      // Select the first active class
      const firstCourseBtn = page.locator('[data-testid^="course-select-"]').first();
      await expect(firstCourseBtn).toBeVisible({ timeout: 15000 });
      const courseTestId = await firstCourseBtn.getAttribute('data-testid');
      createdCourseId = courseTestId!.replace('course-select-', '');
      await firstCourseBtn.click();

      // Step 2 section should now be visible with the option to create a new assignment alongside existing assignments
      const assignmentSection = page.locator('[data-testid="assignment-picker-section"]');
      await expect(assignmentSection).toBeVisible({ timeout: 10000 });

      const createBtn = page.locator('[data-testid="create-new-assignment-button"]');
      await expect(createBtn).toBeVisible();

      // Click "+ New Assignment" to switch to the creation form
      await createBtn.click();

      const createForm = page.locator('[data-testid="create-assignment-form"]');
      await expect(createForm).toBeVisible();

      // Verify back button returns to existing assignments view and button re-opens form
      const cancelCreateBtn = page.locator('[data-testid="cancel-create-assignment-button"]');
      await expect(cancelCreateBtn).toBeVisible();
      await cancelCreateBtn.click();
      await expect(createForm).toBeHidden();
      await createBtn.click();
      await expect(createForm).toBeVisible();

      const submitCreateBtn = page.locator('[data-testid="create-assignment-submit-button"]');
      await expect(submitCreateBtn).toBeDisabled();
      await expect(submitCreateBtn).toContainText('Create & Open');

      const uniqueTitle = `[E2E Test] Modal Created Assignment ${Date.now()}`;
      await page.locator('[data-testid="new-assignment-title-input"]').fill(uniqueTitle);
      await page
        .locator('[data-testid="new-assignment-description-input"]')
        .fill('Complete the lab exercises and submit your Google Doc.');
      await page.locator('[data-testid="new-assignment-max-points-input"]').fill('50');

      await expect(submitCreateBtn).toBeEnabled();
      await submitCreateBtn.click();

      // Modal should close and the newly created assignment tab should open in the workspace
      await expect(modal).toBeHidden({ timeout: 20000 });

      const openTab = page.locator(`[data-testid^="assignment-tab-${createdCourseId}_"]`).first();
      await expect(openTab).toBeVisible({ timeout: 15000 });
      await expect(openTab).toContainText(uniqueTitle);

      const tabTestId = await openTab.getAttribute('data-testid');
      const fullAssignmentId = tabTestId!.replace('assignment-tab-', '');
      createdCourseWorkId = fullAssignmentId.replace(`${createdCourseId}_`, '');

      // Re-open "+ Assignment" and select the same class to verify the newly created assignment is in the existing assignments list with an Open button and no Clone button
      await newAssignmentTabBtn.click();
      await expect(modal).toBeVisible({ timeout: 10000 });
      await page.locator(`[data-testid="course-select-${createdCourseId}"]`).click();
      await expect(page.locator(`[data-testid="assignment-card-${createdCourseWorkId}"]`)).toBeVisible({
        timeout: 10000,
      });
      await expect(page.locator(`[data-testid="clone-assignment-button-${createdCourseWorkId}"]`)).toHaveCount(0);
      await expect(page.locator(`[data-testid="open-assignment-button-${createdCourseWorkId}"]`)).toBeVisible();
      await page.locator('[data-testid="assignment-picker-close-button"]').click();
    } finally {
      if (createdCourseId && createdCourseWorkId) {
        await deleteLiveClassroomAssignmentFixture(createdCourseId, createdCourseWorkId).catch(() => null);
        await cleanupTestAssignment(`${createdCourseId}_${createdCourseWorkId}`, []).catch(() => null);
      }
      if (createdCourseId) {
        await sweepOrphanedTestAssignments(createdCourseId).catch(() => null);
      }
    }
  });

  test('previewAndApproveEvaluation_agentReturnsScoreOrFeedbackDocument_rendersPreviewModalAndApprovesToClassroom_test', async ({
    page,
  }) => {
    const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import(
      '../helpers/classroomSandboxSeeder'
    );
    const [googleToken, customToken] = await Promise.all([
      getLiveTeacherAccessToken(),
      getLiveTestTeacherCustomToken(),
    ]);

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    // Open an assignment workspace
    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await newAssignmentTabBtn.click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();
    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      await courseButtons.nth(i).click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      try {
        await expect(openBtn).toBeVisible({ timeout: 5000 });
        await openBtn.click();
        opened = true;
        break;
      } catch {
        // continue
      }
    }
    expect(opened).toBe(true);
    await expect(page.locator('[data-testid="chat-window"]')).toBeVisible({ timeout: 15000 });

    const openTab = page
      .locator('[data-testid^="assignment-tab-"]:not([data-testid="assignment-tab-bar"])')
      .first();
    await expect(openTab).toBeVisible({ timeout: 15000 });
    const tabIdAttr = await openTab.getAttribute('data-testid');
    const assignmentId = tabIdAttr!.replace('assignment-tab-', '');

    const studentBothId = 'student_eval_both_1';
    const studentScoreOnlyId = 'student_eval_score_only_2';
    const studentDocOnlyId = 'student_eval_doc_only_3';
    const messageId = `test_eval_actions_msg_${Date.now()}`;

    try {
      // Seed staged evaluations in Firestore sidecar
      await seedTestSubmission(assignmentId, studentBothId, {
        submissionId: 'sub_both_1',
        studentName: 'Jordan Both',
        draftGrade: 88,
        overallFeedback: '### Strengths\nGreat recursive base case and clean code structure.',
        classroomSyncStatus: 'PENDING_APPROVAL',
      });

      await seedTestSubmission(assignmentId, studentScoreOnlyId, {
        submissionId: 'sub_score_2',
        studentName: 'Taylor ScoreOnly',
        draftGrade: 95,
        overallFeedback: '',
        classroomSyncStatus: 'PENDING_APPROVAL',
      });

      await seedTestSubmission(assignmentId, studentDocOnlyId, {
        submissionId: 'sub_doc_3',
        studentName: 'Morgan DocOnly',
        overallFeedback: '### Detailed Review\nFocus on edge cases when the list is empty.',
        classroomSyncStatus: 'PENDING_APPROVAL',
      });

      // Seed agent message with 3 evaluate_and_grade_submission tool results (both, score-only, feedback-doc-only)
      await seedTestChatMessage(assignmentId, messageId, {
        sender: 'agent',
        content: 'I have evaluated the three student submissions and staged their results for your review.',
        toolCalls: [
          {
            id: 'call_both_1',
            name: 'evaluate_and_grade_submission',
            args: {
              studentId: studentBothId,
              draftGrade: 88,
              overallFeedback: '### Strengths\nGreat recursive base case and clean code structure.',
            },
            status: 'success',
            result: {
              success: true,
              studentId: studentBothId,
              studentName: 'Jordan Both',
              submissionId: 'sub_both_1',
              grade: 88,
              maxPoints: 100,
              feedback: '### Strengths\nGreat recursive base case and clean code structure.',
              hasScore: true,
              hasFeedbackDoc: true,
              classroomSyncStatus: 'PENDING_APPROVAL',
            },
          },
          {
            id: 'call_score_2',
            name: 'evaluate_and_grade_submission',
            args: {
              studentId: studentScoreOnlyId,
              draftGrade: 95,
            },
            status: 'success',
            result: {
              success: true,
              studentId: studentScoreOnlyId,
              studentName: 'Taylor ScoreOnly',
              submissionId: 'sub_score_2',
              grade: 95,
              maxPoints: 100,
              feedback: '',
              hasScore: true,
              hasFeedbackDoc: false,
              classroomSyncStatus: 'PENDING_APPROVAL',
            },
          },
          {
            id: 'call_doc_3',
            name: 'evaluate_and_grade_submission',
            args: {
              studentId: studentDocOnlyId,
              overallFeedback: '### Detailed Review\nFocus on edge cases when the list is empty.',
            },
            status: 'success',
            result: {
              success: true,
              studentId: studentDocOnlyId,
              studentName: 'Morgan DocOnly',
              submissionId: 'sub_doc_3',
              grade: null,
              maxPoints: 100,
              feedback: '### Detailed Review\nFocus on edge cases when the list is empty.',
              hasScore: false,
              hasFeedbackDoc: true,
              classroomSyncStatus: 'PENDING_APPROVAL',
            },
          },
        ],
      });

      // Verify Return All (N) button is visible in batch header when multiple evaluations exist
      await expect(page.locator('[data-testid="return-all-evaluations-button"]')).toBeVisible();

      // 1. Verify Student 1 (Both Score & Feedback Doc): has "Preview", "Draft", "Return", and "Dismiss" buttons + Score Badge
      const cardBoth = page.locator(`[data-testid="evaluation-action-card-${studentBothId}"]`);
      await expect(cardBoth).toBeVisible({ timeout: 15000 });
      await expect(page.locator(`[data-testid="evaluation-score-badge-${studentBothId}"]`)).toHaveText('88/100');
      await expect(page.locator(`[data-testid="dismiss-evaluation-button-${studentBothId}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="preview-evaluation-button-${studentBothId}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="draft-evaluation-button-${studentBothId}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="return-evaluation-button-${studentBothId}"]`)).toBeVisible();

      // 2. Verify Student 2 (Score Only): has "Draft" and "Return" buttons (NO "Preview" button) + Score Badge
      const cardScoreOnly = page.locator(`[data-testid="evaluation-action-card-${studentScoreOnlyId}"]`);
      await expect(cardScoreOnly).toBeVisible();
      await expect(page.locator(`[data-testid="evaluation-score-badge-${studentScoreOnlyId}"]`)).toHaveText('95/100');
      await expect(page.locator(`[data-testid="preview-evaluation-button-${studentScoreOnlyId}"]`)).toBeHidden();
      await expect(page.locator(`[data-testid="draft-evaluation-button-${studentScoreOnlyId}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="return-evaluation-button-${studentScoreOnlyId}"]`)).toBeVisible();

      // 3. Verify Student 3 (Feedback Document Only): has "Preview", "Draft", and "Return" buttons (NO Score Badge)
      const cardDocOnly = page.locator(`[data-testid="evaluation-action-card-${studentDocOnlyId}"]`);
      await expect(cardDocOnly).toBeVisible();
      await expect(page.locator(`[data-testid="evaluation-score-badge-${studentDocOnlyId}"]`)).toBeHidden();
      await expect(page.locator(`[data-testid="preview-evaluation-button-${studentDocOnlyId}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="draft-evaluation-button-${studentDocOnlyId}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="return-evaluation-button-${studentDocOnlyId}"]`)).toBeVisible();

      // 4. Click "Preview" on Student 1 to open the Feedback Preview Modal, verify Draft & Return buttons, edit feedback, and click "Draft"
      await page.locator(`[data-testid="preview-evaluation-button-${studentBothId}"]`).click();
      const previewModal = page.locator('[data-testid="feedback-preview-modal"]');
      await expect(previewModal).toBeVisible();
      await expect(page.locator('[data-testid="preview-modal-draft-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="preview-modal-return-button"]')).toBeVisible();

      const feedbackTextarea = page.locator('[data-testid="preview-modal-feedback-textarea"]');
      await expect(feedbackTextarea).toBeVisible();
      await expect(feedbackTextarea).toHaveValue(
        '### Strengths\nGreat recursive base case and clean code structure.'
      );

      // Switch to Rendered Preview tab and verify markdown rendering
      await page.locator('[data-testid="preview-modal-rendered-tab"]').click();
      const renderedContent = page.locator('[data-testid="preview-modal-rendered-content"]');
      await expect(renderedContent).toBeVisible();
      await expect(renderedContent.locator('h3', { hasText: 'Strengths' })).toBeVisible();

      // Switch back to Edit Feedback tab, edit text, and click "Draft" first
      await page.locator('[data-testid="preview-modal-edit-tab"]').click();
      const editedFeedback = '### Strengths\nEdited by Teacher: Outstanding recursive implementation and base case!';
      await feedbackTextarea.fill(editedFeedback);

      await page.locator('[data-testid="preview-modal-draft-button"]').click();
      await expect(previewModal).toBeHidden({ timeout: 25000 });

      // Verify Student 1 card now shows Draft Saved badge and attached Google Doc link, while Return button remains available
      await expect(page.locator(`[data-testid="evaluation-draft-badge-${studentBothId}"]`)).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator(`[data-testid="feedback-doc-link-${studentBothId}"]`)).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator(`[data-testid="return-evaluation-button-${studentBothId}"]`)).toBeVisible();

      // Re-open Preview on Student 1 to confirm edited feedback was saved, then click "Return" from the Preview Modal
      await page.locator(`[data-testid="preview-evaluation-button-${studentBothId}"]`).click();
      await expect(previewModal).toBeVisible();
      await expect(feedbackTextarea).toHaveValue(editedFeedback);
      await page.locator('[data-testid="preview-modal-return-button"]').click();
      await expect(previewModal).toBeHidden({ timeout: 25000 });

      // Verify Student 1 card now shows Returned badge
      await expect(page.locator(`[data-testid="evaluation-approved-badge-${studentBothId}"]`)).toBeVisible({
        timeout: 15000,
      });

      // 5. Click "Return" directly on Student 2 (Score Only)
      await page.locator(`[data-testid="return-evaluation-button-${studentScoreOnlyId}"]`).click();
      await expect(page.locator(`[data-testid="evaluation-approved-badge-${studentScoreOnlyId}"]`)).toBeVisible({
        timeout: 20000,
      });
    } finally {
      await cleanupTestAssignment(assignmentId, [
        studentBothId,
        studentScoreOnlyId,
        studentDocOnlyId,
      ]).catch(() => null);
    }
  });

  test('dismissEvaluation_activeEvaluationCard_minimisesChatBubbleAndHidesButtons_test', async ({ page }) => {
    const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import(
      '../helpers/classroomSandboxSeeder'
    );

    const [googleToken, customToken] = await Promise.all([
      getLiveTeacherAccessToken(),
      getLiveTestTeacherCustomToken(),
    ]);

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    // Open existing assignment tab to mount the Chat Panel
    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await newAssignmentTabBtn.click();

    const modal = page.locator('[data-testid="assignment-picker-modal"]');
    await expect(modal).toBeVisible({ timeout: 15000 });

    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();

    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      const courseBtn = courseButtons.nth(i);
      await courseBtn.click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      try {
        await expect(openBtn).toBeVisible({ timeout: 5000 });
        await openBtn.click();
        opened = true;
        break;
      } catch {
        // continue
      }
    }
    expect(opened).toBe(true);
    await expect(page.locator('[data-testid="chat-window"]')).toBeVisible({ timeout: 15000 });

    const openTab = page
      .locator('[data-testid^="assignment-tab-"]:not([data-testid="assignment-tab-bar"])')
      .first();
    await expect(openTab).toBeVisible({ timeout: 15000 });
    const tabIdAttr = await openTab.getAttribute('data-testid');
    const assignmentId = tabIdAttr!.replace('assignment-tab-', '');

    const studentId = 'student_dismiss_test_1';
    const messageId = `test_dismiss_msg_${Date.now()}`;

    try {
      // Seed staged evaluation in Firestore sidecar
      await seedTestSubmission(assignmentId, studentId, {
        submissionId: 'sub_dismiss_1',
        studentName: 'Casey Dismiss',
        draftGrade: 92,
        overallFeedback: 'Excellent performance and detailed solutions.',
        classroomSyncStatus: 'PENDING_APPROVAL',
      });

      // Seed agent message with evaluate_and_grade_submission tool result
      await seedTestChatMessage(assignmentId, messageId, {
        sender: 'agent',
        content: 'I have evaluated Casey Dismiss and staged the results for approval.',
        toolCalls: [
          {
            id: 'call_dismiss_1',
            name: 'evaluate_and_grade_submission',
            args: {
              studentId,
              draftGrade: 92,
              overallFeedback: 'Excellent performance and detailed solutions.',
            },
            status: 'success',
            result: {
              success: true,
              studentId,
              studentName: 'Casey Dismiss',
              submissionId: 'sub_dismiss_1',
              grade: 92,
              maxPoints: 100,
              feedback: 'Excellent performance and detailed solutions.',
              hasScore: true,
              hasFeedbackDoc: true,
              classroomSyncStatus: 'PENDING_APPROVAL',
            },
          },
        ],
      });

      // 1. Verify card and buttons are initially visible
      const card = page.locator(`[data-testid="evaluation-action-card-${studentId}"]`);
      await expect(card).toBeVisible({ timeout: 15000 });
      const dismissBtn = page.locator(`[data-testid="dismiss-evaluation-button-${studentId}"]`);
      const previewBtn = page.locator(`[data-testid="preview-evaluation-button-${studentId}"]`);
      const draftBtn = page.locator(`[data-testid="draft-evaluation-button-${studentId}"]`);
      const returnBtn = page.locator(`[data-testid="return-evaluation-button-${studentId}"]`);
      await expect(dismissBtn).toBeVisible();
      await expect(previewBtn).toBeVisible();
      await expect(draftBtn).toBeVisible();
      await expect(returnBtn).toBeVisible();

      // 2. Click "Dismiss" on the evaluation action card
      await dismissBtn.click();

      // 3. Verify the chat bubble is minimised and buttons are removed from view
      const minimisedBubble = page.locator(`[data-testid="minimised-chat-bubble-${messageId}"]`);
      await expect(minimisedBubble).toBeVisible({ timeout: 5000 });
      await expect(minimisedBubble).toContainText('Casey Dismiss');
      await expect(minimisedBubble).toContainText('92/100');

      // The other buttons (Preview, Draft & Return) and card are removed from view
      await expect(card).toBeHidden();
      await expect(previewBtn).toBeHidden();
      await expect(draftBtn).toBeHidden();
      await expect(returnBtn).toBeHidden();

      // 4. Click "Expand" to restore the chat bubble
      const expandBtn = page.locator(`[data-testid="expand-message-button-${messageId}"]`);
      await expect(expandBtn).toBeVisible();
      await expandBtn.click();

      // 5. Verify the chat bubble expands and buttons are restored
      await expect(card).toBeVisible({ timeout: 5000 });
      await expect(previewBtn).toBeVisible();
      await expect(draftBtn).toBeVisible();
      await expect(returnBtn).toBeVisible();
      await expect(dismissBtn).toBeVisible();

      // 6. Dismiss again and test localStorage persistence across page reload
      await dismissBtn.click();
      await expect(minimisedBubble).toBeVisible();

      // Verify stored in localStorage
      const storedMinimised = await page.evaluate((asgnId) => {
        return window.localStorage.getItem(`classroom_agent_minimised_messages_${asgnId}`);
      }, assignmentId);
      expect(storedMinimised).toBeTruthy();
      expect(JSON.parse(storedMinimised!)).toContain(messageId);

      await page.reload();

      // Re-open assignment tab from picker after page reload
      const reopenTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
      await expect(reopenTabBtn).toBeVisible({ timeout: 15000 });
      await reopenTabBtn.click();

      const reopenModal = page.locator('[data-testid="assignment-picker-modal"]');
      await expect(reopenModal).toBeVisible({ timeout: 15000 });

      for (let i = 0; i < courseCount; i++) {
        const courseBtn = page.locator('[data-testid^="course-select-"]').nth(i);
        await courseBtn.click();
        await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
        const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
        try {
          await expect(openBtn).toBeVisible({ timeout: 5000 });
          await openBtn.click();
          break;
        } catch {
          // continue
        }
      }

      await expect(page.locator('[data-testid="chat-window"]')).toBeVisible({ timeout: 15000 });
      await expect(page.locator(`[data-testid="minimised-chat-bubble-${messageId}"]`)).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator(`[data-testid="evaluation-action-card-${studentId}"]`)).toBeHidden();
    } finally {
      await cleanupTestAssignment(assignmentId, [studentId]).catch(() => null);
    }
  });

  test('createAssignmentViaAgentTool_teacherPromptsChatPanel_invokesCreateClassroomAssignmentToolAndOpensNewTab_test', async ({
    page,
  }) => {
    const {
      getLiveTeacherAccessToken,
      getLiveTestTeacherCustomToken,
      deleteLiveClassroomAssignmentFixture,
      sweepOrphanedTestAssignments,
    } = await import('../helpers/classroomSandboxSeeder');

    const [googleToken, customToken] = await Promise.all([
      getLiveTeacherAccessToken(),
      getLiveTestTeacherCustomToken(),
    ]);

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    let activeCourseId = '';
    let initialAssignmentId = '';
    let createdCourseWorkId = '';

    try {
      await page.goto('/');

      // Open an existing assignment tab so the Chat Panel is mounted
      const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
      await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
      await newAssignmentTabBtn.click();

      const modal = page.locator('[data-testid="assignment-picker-modal"]');
      await expect(modal).toBeVisible({ timeout: 15000 });

      const courseButtons = page.locator('[data-testid^="course-select-"]');
      await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
      const courseCount = await courseButtons.count();

      let opened = false;
      for (let i = 0; i < courseCount; i++) {
        const courseBtn = courseButtons.nth(i);
        const courseTestId = await courseBtn.getAttribute('data-testid');
        const cId = courseTestId!.replace('course-select-', '');
        await courseBtn.click();
        await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
        const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
        try {
          await expect(openBtn).toBeVisible({ timeout: 5000 });
          await openBtn.click();
          activeCourseId = cId;
          opened = true;
          break;
        } catch {
          // Try next course
        }
      }
      expect(opened).toBe(true);
      await expect(modal).toBeHidden({ timeout: 10000 });

      const firstTab = page.locator(`[data-testid^="assignment-tab-${activeCourseId}_"]`).first();
      await expect(firstTab).toBeVisible({ timeout: 15000 });
      const firstTabTestId = await firstTab.getAttribute('data-testid');
      initialAssignmentId = firstTabTestId!.replace('assignment-tab-', '');

      const chatInput = page.locator('[data-testid="chat-input"]');
      const chatSendBtn = page.locator('[data-testid="chat-send-button"]');
      await expect(chatInput).toBeVisible({ timeout: 15000 });

      const uniqueTitle = `[E2E Test] Agent Created Assignment ${Date.now()}`;
      await chatInput.fill(
        `Create a new assignment in this course titled "${uniqueTitle}" with description "Write a 300-word reflection on recursion." and maxPoints 40.`
      );
      await chatSendBtn.click();

      // Verify the Created Assignment action card renders in the chat message
      const createdCard = page.locator('[data-testid^="created-assignment-card-"]').first();
      await expect(createdCard).toBeVisible({ timeout: 45000 });
      await expect(createdCard).toContainText(uniqueTitle);
      await expect(createdCard).toContainText('40 pts');

      // By default, tool call badges are hidden (Show Tool Calls setting is off)
      const createToolBadge = page
        .locator('[data-testid="tool-call-badge"]', { hasText: 'Tool: create_classroom_assignment' })
        .first();
      await expect(createToolBadge).toBeHidden();

      // Enable Show Tool Calls in Settings -> Advanced and verify the tool call badge appears
      await page.locator('[data-testid="user-account-button"]').click();
      await page.locator('[data-testid="user-menu-settings-button"]').click();
      await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
      await page.locator('[data-testid="settings-tab-advanced"]').click();
      await page.locator('[data-testid="toggle-show-tool-calls-setting"]').click();
      await page.locator('[data-testid="close-settings-button"]').click();
      await expect(page.locator('[data-testid="settings-modal"]')).toBeHidden();

      await expect(createToolBadge).toBeVisible({ timeout: 10000 });
      await expect(createToolBadge).toContainText('success');

      const cardTestId = await createdCard.getAttribute('data-testid');
      createdCourseWorkId = cardTestId!.replace('created-assignment-card-', '');

      // Click "Open in Workspace Tab" on the created assignment card
      const openCreatedBtn = page.locator(`[data-testid="open-created-assignment-button-${createdCourseWorkId}"]`);
      await expect(openCreatedBtn).toBeVisible();
      await openCreatedBtn.click();

      // Verify the new tab opens in the top tab bar with the created assignment's title
      const createdTab = page.locator(`[data-testid="assignment-tab-${activeCourseId}_${createdCourseWorkId}"]`);
      await expect(createdTab).toBeVisible({ timeout: 15000 });
      await expect(createdTab).toContainText(uniqueTitle);
    } finally {
      if (activeCourseId && createdCourseWorkId) {
        await deleteLiveClassroomAssignmentFixture(activeCourseId, createdCourseWorkId).catch(() => null);
        await cleanupTestAssignment(`${activeCourseId}_${createdCourseWorkId}`, []).catch(() => null);
      }
      if (initialAssignmentId) {
        await cleanupTestAssignment(initialAssignmentId, []).catch(() => null);
      }
      if (activeCourseId) {
        await sweepOrphanedTestAssignments(activeCourseId).catch(() => null);
      }
    }
  });

  test('topUpCreditsModal_openFromChatHeaderAndUserMenu_displays100InitialCreditsAndLiveStripePrice_test', async ({
    page,
  }) => {
    const TEACHER_UID = 'teacher_live_e2e';
    await deleteTestUser(TEACHER_UID);

    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import(
        '../helpers/classroomSandboxSeeder'
      );
      const [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);

      await page.addInitScript(
        ({ gToken, cToken }) => {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        },
        { gToken: googleToken, cToken: customToken }
      );

      await page.goto('/');
      await expect(page.locator('[data-testid="assignment-tab-bar"]')).toBeVisible({ timeout: 15000 });

      // 1. Open User Account Menu and verify "Top up credits" with 100 initial credits badge
      await page.locator('[data-testid="user-account-button"]').click();
      await expect(page.locator('[data-testid="user-account-menu"]')).toBeVisible();
      const menuTopUpBtn = page.locator('[data-testid="user-menu-topup-credits-button"]');
      await expect(menuTopUpBtn).toBeVisible();
      await expect(menuTopUpBtn).toContainText('Top up credits');
      await expect(page.locator('[data-testid="user-menu-credits-badge"]')).toHaveText('100', { timeout: 15000 });

      // Click "Top up credits" in user menu to open the modal
      await menuTopUpBtn.click();
      const topUpModal = page.locator('[data-testid="topup-credits-modal"]');
      await expect(topUpModal).toBeVisible();
      await expect(page.locator('[data-testid="topup-modal-current-credits"]')).toContainText('100');
      await expect(page.locator('[data-testid="topup-promo-code-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="topup-checkout-button"]')).toBeVisible();

      // Wait for live Stripe product price to load
      await expect(page.locator('[data-testid="topup-modal-price"]')).not.toContainText('Loading...', {
        timeout: 15000,
      });

      // Close modal
      await page.locator('[data-testid="close-topup-modal-button"]').click();
      await expect(topUpModal).toBeHidden();

      // 2. Open an assignment tab and verify the top-up button in the ChatPanel header
      await page.locator('[data-testid="new-assignment-tab-button"]').click();
      const pickerModal = page.locator('[data-testid="assignment-picker-modal"]');
      await expect(pickerModal).toBeVisible({ timeout: 15000 });

      const courseButtons = page.locator('[data-testid^="course-select-"]');
      await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
      const courseCount = await courseButtons.count();

      let opened = false;
      for (let i = 0; i < courseCount; i++) {
        await courseButtons.nth(i).click();
        await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
        const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
        try {
          await expect(openBtn).toBeVisible({ timeout: 5000 });
          await openBtn.click();
          opened = true;
          break;
        } catch {
          // Try next course
        }
      }
      expect(opened).toBe(true);

      const chatTopUpBtn = page.locator('[data-testid="top-up-credits-button"]');
      await expect(chatTopUpBtn).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid="chat-credits-count"]')).toHaveText('100');

      await chatTopUpBtn.click();
      await expect(topUpModal).toBeVisible();
      await page.locator('[data-testid="close-topup-modal-button"]').click();
      await expect(topUpModal).toBeHidden();
    } finally {
      await seedTestUserCredits(TEACHER_UID, 100).catch(() => null);
    }
  });

  test('enforceAiCreditsAndDeduct_zeroCreditsBlocksAgentAndFetchingStudentWorkDeductsOneCredit_test', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const TEACHER_UID = 'teacher_live_e2e';
    let assignmentId = '';

    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import(
        '../helpers/classroomSandboxSeeder'
      );
      const [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);

      // Start with 0 credits to verify the zero-credit gate
      await seedTestUserCredits(TEACHER_UID, 0);

      await page.addInitScript(
        ({ gToken, cToken }) => {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        },
        { gToken: googleToken, cToken: customToken }
      );

      await page.goto('/');
      await page.locator('[data-testid="new-assignment-tab-button"]').click();
      await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

      const courseButtons = page.locator('[data-testid^="course-select-"]');
      await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
      const courseCount = await courseButtons.count();

      let opened = false;
      for (let i = 0; i < courseCount; i++) {
        await courseButtons.nth(i).click();
        await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
        const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
        try {
          await expect(openBtn).toBeVisible({ timeout: 5000 });
          const btnTestId = await openBtn.getAttribute('data-testid');
          assignmentId = btnTestId!.replace('open-assignment-button-', '');
          await openBtn.click();
          opened = true;
          break;
        } catch {
          // Try next course
        }
      }
      expect(opened).toBe(true);

      // Verify 0 credits state in ChatPanel
      await expect(page.locator('[data-testid="chat-credits-count"]')).toHaveText('0', { timeout: 15000 });
      await expect(page.locator('[data-testid="out-of-credits-banner"]')).toBeVisible();
      await expect(page.locator('[data-testid="chat-input"]')).toBeDisabled();
      await expect(page.locator('[data-testid="chat-send-button"]')).toBeDisabled();

      // Clicking "Top Up Credits" on the out-of-credits banner opens the modal
      await page.locator('[data-testid="out-of-credits-topup-button"]').click();
      await expect(page.locator('[data-testid="topup-credits-modal"]')).toBeVisible();
      await page.locator('[data-testid="close-topup-modal-button"]').click();

      // Now top up user credits to 50 and verify real-time onSnapshot re-enables the chat input
      await seedTestUserCredits(TEACHER_UID, 50);
      await expect(page.locator('[data-testid="chat-credits-count"]')).toHaveText('50', { timeout: 15000 });
      await expect(page.locator('[data-testid="out-of-credits-banner"]')).toBeHidden();
      await expect(page.locator('[data-testid="chat-input"]')).toBeEnabled();

      // Wait for at least one student row to load in the roster and select that student
      const firstStudentRow = page.locator('[data-testid^="student-row-"]').first();
      await expect(firstStudentRow).toBeVisible({ timeout: 20000 });
      const rowTestId = await firstStudentRow.getAttribute('data-testid');
      const targetStudentId = rowTestId!.replace('student-row-', '');
      await firstStudentRow.click();

      // Command the agent to fetch the selected student's submission content
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill(
        `Call get_student_submission_content for studentId "${targetStudentId}" and briefly summarize what files or content they submitted in 1 sentence. Do not grade it.`
      );
      await page.locator('[data-testid="chat-send-button"]').click();

      // Verify that fetching the student's work deducts 1 credit (50 -> 49)
      await expect(page.locator('[data-testid="chat-credits-count"]')).toHaveText('49', { timeout: 45000 });
    } finally {
      await seedTestUserCredits(TEACHER_UID, 100).catch(() => null);
      if (assignmentId) {
        await cleanupTestAssignment(assignmentId, []).catch(() => null);
      }
    }
  });

  test('stripeCheckoutAndVerifySession_sandboxPurchase_adds100AiCreditsIdempotently_test', async ({
    page,
    request,
  }) => {
    const TEACHER_UID = 'teacher_live_e2e';
    const isProd = process.env.TEST_ENV === 'prod' || process.env.TEST_ENV === 'production';
    const API_BASE_URL = isProd
      ? 'https://europe-west2-classroom-agent-511917.cloudfunctions.net/api'
      : process.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001/classroom-agent-511917/europe-west2/api';
    const FRONTEND_ORIGIN = isProd ? 'https://classroom-agent-511917.web.app' : 'http://127.0.0.1:5173';

    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import(
        '../helpers/classroomSandboxSeeder'
      );
      const [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);

      // Start user with 25 AI credits
      await seedTestUserCredits(TEACHER_UID, 25);

      // 1. Create a real Stripe Checkout session in sandbox mode
      const createRes = await request.post(`${API_BASE_URL}/stripe/checkout-session`, {
        data: {
          ownerUid: TEACHER_UID,
          email: 'teacher_e2e@classroom-agent.test',
          creditsCount: 100,
          successUrl: `${FRONTEND_ORIGIN}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&credits=100`,
          cancelUrl: `${FRONTEND_ORIGIN}/?checkout=canceled`,
        },
      });
      expect(createRes.ok()).toBe(true);
      const createData = await createRes.json();
      expect(createData.success).toBe(true);
      expect(createData.sessionId).toMatch(/^cs_test_/);
      expect(createData.url).toContain('stripe.com');

      const sessionId = createData.sessionId;

      await page.addInitScript(
        ({ gToken, cToken }) => {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        },
        { gToken: googleToken, cToken: customToken }
      );

      // 2. Open an assignment tab before going to Stripe Checkout
      await page.goto('/');
      await page.locator('[data-testid="new-assignment-tab-button"]').click();
      await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

      const courseButtons = page.locator('[data-testid^="course-select-"]');
      await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
      const courseCount = await courseButtons.count();

      let openedAssignmentId = '';
      for (let i = 0; i < courseCount; i++) {
        const courseBtn = courseButtons.nth(i);
        const courseTestId = await courseBtn.getAttribute('data-testid');
        const cId = courseTestId!.replace('course-select-', '');
        await courseBtn.click();
        await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
        const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
        try {
          await expect(openBtn).toBeVisible({ timeout: 5000 });
          const btnTestId = await openBtn.getAttribute('data-testid');
          const cwId = btnTestId!.replace('open-assignment-button-', '');
          openedAssignmentId = `${cId}_${cwId}`;
          await openBtn.click();
          break;
        } catch {
          // Try next course
        }
      }
      expect(openedAssignmentId).toBeTruthy();
      await expect(page.locator(`[data-testid="assignment-tab-${openedAssignmentId}"]`)).toBeVisible({
        timeout: 15000,
      });

      // 3. Simulate redirect back from Stripe Checkout to SPA root
      await page.goto(`/?checkout=success&session_id=${sessionId}&credits=100`);

      // Verify TopUpCreditsModal opens automatically with success banner and +100 credits (25 -> 125)
      await expect(page.locator('[data-testid="topup-credits-modal"]')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid="topup-success-banner"]')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid="topup-success-banner"]')).toContainText('+100 AI credits');
      await expect(page.locator('[data-testid="topup-modal-current-credits"]')).toContainText('125', {
        timeout: 15000,
      });

      // Close modal and verify the previously opened assignment tab and workspace are still open!
      await page.locator('[data-testid="close-topup-modal-button"]').click();
      await expect(page.locator('[data-testid="topup-credits-modal"]')).toBeHidden();
      await expect(page.locator(`[data-testid="assignment-tab-${openedAssignmentId}"]`)).toBeVisible();
      await expect(page.locator('[data-testid="empty-workspace-state"]')).toBeHidden();
      await expect(page.locator('[data-testid="chat-window"]')).toBeVisible();

      // Verify URL query params were cleaned up
      await expect
        .poll(() => page.url(), { timeout: 10000 })
        .not.toContain('session_id=');

      // 4. Verify idempotency: calling verify-session again for the same sessionId does not double-credit
      const secondVerifyRes = await request.post(`${API_BASE_URL}/stripe/verify-session`, {
        data: {
          sessionId,
          ownerUid: TEACHER_UID,
        },
      });
      expect(secondVerifyRes.ok()).toBe(true);
      const secondVerifyData = await secondVerifyRes.json();
      expect(secondVerifyData.alreadyFulfilled).toBe(true);
      expect(secondVerifyData.aiCredits).toBe(125);
    } finally {
      await seedTestUserCredits(TEACHER_UID, 100).catch(() => null);
    }
  });

  test('submissionPreviewZone_submittedAndFeedbackDocs_cachesDriveFilesAndPersistsPdfIframes_test', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const {
      setupLiveClassroomBatchFixture,
      teardownLiveClassroomBatchFixture,
    } = await import('../helpers/classroomSandboxSeeder');

    const fixture = await setupLiveClassroomBatchFixture({
      title: `[E2E Test] Preview Cache & PDF Iframe Pool ${Date.now()}`,
    });

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: fixture.teacherAccessToken, cToken: fixture.customAuthToken }
    );

    const openedAssignmentId = fixture.assignmentId;
    const activeStudentId = fixture.student.userId;

    try {
      await page.goto('/');

      const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
      await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
      await newAssignmentTabBtn.click();
      await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

      const courseBtn = page.locator(`[data-testid="course-select-${fixture.courseId}"]`);
      await expect(courseBtn).toBeVisible({ timeout: 15000 });
      await courseBtn.click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });

      const openBtn = page.locator(`[data-testid="open-assignment-button-${fixture.courseWork.id}"]`);
      await expect(openBtn).toBeVisible({ timeout: 15000 });
      await openBtn.click();

      await expect(page.locator('[data-testid="student-roster-list"]')).toBeVisible({ timeout: 15000 });
      const studentRow = page.locator(`[data-testid="student-row-${activeStudentId}"]`);
      await expect(studentRow).toBeVisible({ timeout: 10000 });

      // Select the Google Doc attachment tab so the PDF preview iframe renders
      const googleDocTab = page.locator(`[data-testid="attachment-tab-${fixture.googleDocFileId}"]`);
      await expect(googleDocTab).toBeVisible({ timeout: 15000 });
      await googleDocTab.click();

      // Wait for initial submitted document PDF preview iframe to render
      const activePdfFrame = page.locator('[data-testid="preview-pdf-frame"]');
      await expect(activePdfFrame).toBeVisible({ timeout: 30000 });
      const initialSubBlobSrc = await activePdfFrame.getAttribute('src');
      expect(initialSubBlobSrc).toMatch(/^blob:/);

      const submittedFileId = fixture.googleDocFileId;

      const mockFeedbackDocId = `feedback_doc_test_${Date.now()}`;
      let feedbackPreviewFetchCount = 0;
      let submittedPreviewFetchCountAfterLoad = 0;

      await page.route(`**/classroom/drive-file/${mockFeedbackDocId}*`, async (route) => {
        const url = route.request().url();
        if (url.includes('exportType=preview')) {
          feedbackPreviewFetchCount++;
          const minimalPdf = Buffer.from(
            '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF',
            'utf-8'
          );
          await route.fulfill({
            status: 200,
            contentType: 'application/pdf',
            body: minimalPdf,
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'text/plain',
            body: 'Feedback Document Text Content',
          });
        }
      });

      await page.route(`**/classroom/drive-file/${submittedFileId}*`, async (route) => {
        const url = route.request().url();
        if (url.includes('exportType=preview')) {
          submittedPreviewFetchCountAfterLoad++;
        }
        await route.continue();
      });

      await seedTestSubmission(openedAssignmentId, activeStudentId, {
        studentId: activeStudentId,
        submissionId: fixture.submissionId,
        draftGrade: 92,
        overallFeedback: '# Great Essay\n\nWell structured argument.',
        classroomSyncStatus: 'APPROVED',
        feedbackDocId: mockFeedbackDocId,
        feedbackDocUrl: `https://docs.google.com/document/d/${mockFeedbackDocId}/edit`,
      });

      // Verify the Feedback Document tab appears automatically in the attachment switcher and gets prefetched!
      const feedbackTab = page.locator(`[data-testid="attachment-tab-${mockFeedbackDocId}"]`);
      await expect(feedbackTab).toBeVisible({ timeout: 10000 });

      // Wait for background prefetch of the feedback document to complete and mount its cached iframe
      const cachedFeedbackFrame = page.locator(
        `[data-testid="preview-pdf-frame-cached-${mockFeedbackDocId}"]`
      );
      await expect(cachedFeedbackFrame).toBeAttached({ timeout: 15000 });
      expect(feedbackPreviewFetchCount).toBe(1);

      // Click the Feedback Document tab -> should switch instantaneously with 0 additional fetches
      // while keeping the Submitted Document iframe mounted in the DOM!
      await feedbackTab.click();
      await expect(activePdfFrame).toBeVisible();
      const feedbackBlobSrc = await activePdfFrame.getAttribute('src');
      expect(feedbackBlobSrc).toMatch(/^blob:/);
      expect(feedbackBlobSrc).not.toBe(initialSubBlobSrc);

      // Verify the submitted document iframe is still mounted in the DOM (hidden, not unmounted)
      const cachedSubmittedFrame = page.locator(
        `[data-testid="preview-pdf-frame-cached-${submittedFileId}"]`
      );
      await expect(cachedSubmittedFrame).toBeAttached();
      await expect(cachedSubmittedFrame).toHaveAttribute('src', initialSubBlobSrc!);

      // Switch back to the Submitted Document tab -> instant, same blob URL, 0 new network fetches
      await googleDocTab.click();
      await expect(activePdfFrame).toBeVisible();
      await expect(activePdfFrame).toHaveAttribute('src', initialSubBlobSrc!);
      await expect(cachedFeedbackFrame).toBeAttached();
      await expect(cachedFeedbackFrame).toHaveAttribute('src', feedbackBlobSrc!);

      // Switch to Feedback Document tab a second time -> still 0 additional fetches
      await feedbackTab.click();
      await expect(activePdfFrame).toHaveAttribute('src', feedbackBlobSrc!);
      expect(feedbackPreviewFetchCount).toBe(1);
      expect(submittedPreviewFetchCountAfterLoad).toBe(0);
    } finally {
      await cleanupTestAssignment(openedAssignmentId, [activeStudentId]).catch(() => null);
      await teardownLiveClassroomBatchFixture(fixture).catch(() => null);
    }
  });

  test('chatQuickActions_defaultStateAndSettingsManagement_togglesPillsAndSendsPrompts_test', async ({
    page,
  }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch {
      googleToken = '';
      customToken = '';
    }

    // 1. Inject tokens and clear any quick actions storage
    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
        window.localStorage.removeItem('classroom_agent_show_quick_actions');
        window.localStorage.removeItem('classroom_agent_quick_actions');
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await newAssignmentTabBtn.click();

    const assignmentPickerModal = page.locator('[data-testid="assignment-picker-modal"]');
    await expect(assignmentPickerModal).toBeVisible({ timeout: 15000 });

    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();

    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      const courseBtn = courseButtons.nth(i);
      await courseBtn.click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      try {
        await expect(openBtn).toBeVisible({ timeout: 5000 });
        await openBtn.click();
        opened = true;
        break;
      } catch {
        // Continue to check next course
      }
    }
    expect(opened).toBe(true);
    await expect(assignmentPickerModal).toBeHidden();

    // Verify ChatPanel is visible
    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toBeVisible({ timeout: 15000 });

    // 2. Verify quick action bar and default pills are visible by default
    const quickActionsBar = page.locator('[data-testid="chat-quick-actions-bar"]');
    await expect(quickActionsBar).toBeVisible();

    const gradeSelectedPill = page.locator('[data-testid="quick-action-pill-grade-selected"]');
    const gradeAllPill = page.locator('[data-testid="quick-action-pill-grade-all"]');
    const generateRubricPill = page.locator('[data-testid="quick-action-pill-generate-rubric"]');
    const followUpPill = page.locator('[data-testid="quick-action-pill-follow-up"]');
    const classSummaryPill = page.locator('[data-testid="quick-action-pill-class-summary"]');
    await expect(gradeSelectedPill).toBeVisible();
    await expect(gradeAllPill).toBeVisible();
    await expect(generateRubricPill).toBeVisible();
    await expect(followUpPill).toBeHidden();
    await expect(classSummaryPill).toBeHidden();

    // 3. Open Settings Modal from TopTabBar user menu
    const userAccountBtn = page.locator('[data-testid="user-account-button"]');
    await expect(userAccountBtn).toBeVisible({ timeout: 10000 });
    await userAccountBtn.click();
    const userMenuSettingsBtn = page.locator('[data-testid="user-menu-settings-button"]');
    await expect(userMenuSettingsBtn).toBeVisible();
    await userMenuSettingsBtn.click();

    const settingsModal = page.locator('[data-testid="settings-modal"]');
    await expect(settingsModal).toBeVisible();

    // Switch to Quick Actions tab
    const quickActionsTab = page.locator('[data-testid="settings-tab-quick-actions"]');
    await expect(quickActionsTab).toBeVisible();
    await quickActionsTab.click();
    await expect(page.locator('[data-testid="quick-actions-settings-section"]')).toBeVisible();

    // Verify follow-up and class-summary toggles are off by default
    await expect(page.locator('[data-testid="toggle-quick-action-follow-up"]')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('[data-testid="toggle-quick-action-class-summary"]')).toHaveAttribute('aria-checked', 'false');

    // 4. Master toggle: toggle off
    const masterToggle = page.locator('[data-testid="toggle-show-quick-actions-setting"]');
    await expect(masterToggle).toHaveAttribute('aria-checked', 'true');
    await masterToggle.click();
    await expect(masterToggle).toHaveAttribute('aria-checked', 'false');

    // Close settings modal and verify chat quick actions bar is hidden
    await page.locator('[data-testid="close-settings-button"]').click();
    await expect(settingsModal).toBeHidden();
    await expect(quickActionsBar).toBeHidden();

    // 5. Re-open settings, re-enable master toggle, disable one item, and add a custom prompt
    await userAccountBtn.click();
    await userMenuSettingsBtn.click();
    await expect(settingsModal).toBeVisible();
    await quickActionsTab.click();
    await expect(masterToggle).toHaveAttribute('aria-checked', 'false');
    await masterToggle.click();
    await expect(masterToggle).toHaveAttribute('aria-checked', 'true');

    // Disable grade-selected pill
    const gradeSelectedToggle = page.locator('[data-testid="toggle-quick-action-grade-selected"]');
    await expect(gradeSelectedToggle).toHaveAttribute('aria-checked', 'true');
    await gradeSelectedToggle.click();
    await expect(gradeSelectedToggle).toHaveAttribute('aria-checked', 'false');

    // Add custom quick action
    const addCustomBtn = page.locator('[data-testid="add-quick-action-button"]');
    await expect(addCustomBtn).toBeVisible();
    await addCustomBtn.click();

    await page.locator('[data-testid="custom-action-label-input"]').fill('Proofread');
    await page.locator('[data-testid="custom-action-prompt-input"]').fill('Proofread this submission for grammar and syntax issues');
    await page.locator('[data-testid="save-custom-action-button"]').click();

    // Verify custom item appears in settings list with Custom badge
    const customItem = page.locator('[data-testid^="quick-action-item-custom-"]');
    await expect(customItem).toBeVisible();
    await expect(customItem).toContainText('Proofread');

    // Close settings modal
    await page.locator('[data-testid="done-settings-button"]').click();
    await expect(settingsModal).toBeHidden();

    // 6. Verify ChatPanel pills:
    // - quick actions bar is visible again
    // - grade-selected pill is hidden
    // - custom "Proofread" pill is visible
    await expect(quickActionsBar).toBeVisible();
    await expect(gradeSelectedPill).toBeHidden();
    const customPill = page.locator('[data-testid^="quick-action-pill-custom-"]');
    await expect(customPill).toBeVisible();
    await expect(customPill).toContainText('Proofread');

    // 7. Click custom pill -> immediately sends prompt
    await customPill.click();

    // Verify user chat bubble appears with prompt content
    const userMessage = page.locator('.whitespace-pre-wrap', {
      hasText: 'Proofread this submission for grammar and syntax issues',
    });
    await expect(userMessage).toBeVisible({ timeout: 10000 });

    // 8. Clean up localStorage
    await page.evaluate(() => {
      window.localStorage.removeItem('classroom_agent_show_quick_actions');
      window.localStorage.removeItem('classroom_agent_quick_actions');
    });
  });

  test('chatSupportAndContextDigest_teacherAsksHowToQuestion_sendsWorkspaceContextAndInvokesGetUserGuideTool_test', async ({
    page,
  }) => {
    let googleToken = '';
    let customToken = '';
    try {
      const { getLiveTeacherAccessToken, getLiveTestTeacherCustomToken } = await import('../helpers/classroomSandboxSeeder');
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);
    } catch {
      googleToken = '';
      customToken = '';
    }

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
        window.localStorage.setItem('classroom_agent_show_tool_calls', 'true');
      },
      { gToken: googleToken, cToken: customToken }
    );

    await page.goto('/');

    const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
    await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
    await newAssignmentTabBtn.click();

    const assignmentPickerModal = page.locator('[data-testid="assignment-picker-modal"]');
    await expect(assignmentPickerModal).toBeVisible({ timeout: 15000 });

    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();

    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      const courseBtn = courseButtons.nth(i);
      await courseBtn.click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const openBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      try {
        await expect(openBtn).toBeVisible({ timeout: 5000 });
        await openBtn.click();
        opened = true;
        break;
      } catch {
        // Continue to check next course
      }
    }
    expect(opened).toBe(true);
    await expect(assignmentPickerModal).toBeHidden();

    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toBeVisible({ timeout: 15000 });

    // Intercept POST /api/chat to inspect the outgoing workspaceContext digest
    let capturedChatPayload: any = null;
    page.on('request', (req) => {
      if (req.url().includes('/chat') && req.method() === 'POST') {
        try {
          capturedChatPayload = JSON.parse(req.postData() || '{}');
        } catch {
          // ignore
        }
      }
    });

    const chatInput = chatWindow.locator('textarea');
    await expect(chatInput).toBeVisible();
    await chatInput.fill(
      'Who am I, how many AI credits do I have, and how do I use Draft vs Return or top up my credits? Please consult the user guide.'
    );
    await chatInput.press('Enter');

    // Wait for the request payload to be captured
    await expect.poll(() => capturedChatPayload, { timeout: 10000 }).not.toBeNull();
    expect(capturedChatPayload.workspaceContext).toBeDefined();
    expect(Array.isArray(capturedChatPayload.workspaceContext.openTabs)).toBe(true);
    expect(capturedChatPayload.workspaceContext.openTabs.length).toBeGreaterThanOrEqual(1);
    expect(capturedChatPayload.workspaceContext.openTabs[0].isActive).toBe(true);
    expect(typeof capturedChatPayload.workspaceContext.showRubricPane).toBe('boolean');
    expect(capturedChatPayload.workspaceContext.showToolCalls).toBe(true);

    // Verify the agent invokes the get_user_guide tool and renders the tool call badge
    const toolBadge = chatWindow.locator('[data-testid="tool-call-badge"]', {
      hasText: 'get_user_guide',
    });
    await expect(toolBadge.first()).toBeVisible({ timeout: 45000 });

    // Wait for the agent's response text to finish streaming and mention Draft / Return / Credits
    await expect(chatWindow).toContainText(/Draft|Return|Credits/i, { timeout: 45000 });

    await page.evaluate(() => {
      window.localStorage.removeItem('classroom_agent_show_tool_calls');
    });
  });

  test('cloneNativeAssignmentFromPicker_nativeCourseworkInCourse_blocksDirectSelectionShowsExplanationAndClonesWithRubric_test', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const {
      getLiveTeacherAccessToken,
      getLiveTestTeacherCustomToken,
      deleteLiveClassroomAssignmentFixture,
      sweepOrphanedTestAssignments,
    } = await import('../helpers/classroomSandboxSeeder');
    const [googleToken, customToken] = await Promise.all([
      getLiveTeacherAccessToken(),
      getLiveTestTeacherCustomToken(),
    ]);

    await page.addInitScript(
      ({ gToken, cToken }) => {
        if (gToken) {
          window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
        }
        if (cToken) {
          window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        }
      },
      { gToken: googleToken, cToken: customToken }
    );

    let targetCourseId = '';
    let sourceNativeCwId = '';
    let clonedCourseWorkId = '';

    try {
      await page.goto('/');

      const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
      await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
      await newAssignmentTabBtn.click();

      const modal = page.locator('[data-testid="assignment-picker-modal"]');
      await expect(modal).toBeVisible({ timeout: 15000 });

      // Verify Cancel and OK footer buttons are completely removed from the modal
      await expect(page.locator('[data-testid="assignment-picker-cancel-button"]')).toBeHidden();
      await expect(page.locator('[data-testid="assignment-picker-ok-button"]')).toBeHidden();

      const courseButtons = page.locator('[data-testid^="course-select-"]');
      await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
      const courseCount = await courseButtons.count();

      // Find a course that has a native Classroom assignment (data-native-assignment="true")
      const nativeCardLocator = page.locator('[data-native-assignment="true"]').first();
      for (let i = 0; i < courseCount; i++) {
        const courseBtn = courseButtons.nth(i);
        const courseTestId = await courseBtn.getAttribute('data-testid');
        const cId = courseTestId!.replace('course-select-', '');
        await courseBtn.click();
        await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
        try {
          await expect(nativeCardLocator).toBeVisible({ timeout: 1000 });
          targetCourseId = cId;
          break;
        } catch {
          // Check next course
        }
      }

      expect(targetCourseId).not.toBe('');
      await expect(nativeCardLocator).toBeVisible();

      const nativeCardTestId = await nativeCardLocator.getAttribute('data-testid');
      sourceNativeCwId = nativeCardTestId!.replace('assignment-card-', '');

      // 1. Verify native assignment is visible without the old badge, inline explanation, or Clone button, and has Info + disabled Open button
      await expect(page.locator(`[data-testid="native-assignment-badge-${sourceNativeCwId}"]`)).toBeHidden();
      await expect(page.locator(`[data-testid="native-assignment-explanation-${sourceNativeCwId}"]`)).toBeHidden();
      await expect(page.locator(`[data-testid="open-assignment-button-${sourceNativeCwId}"]`)).toBeHidden();
      await expect(page.locator(`[data-testid="clone-assignment-button-${sourceNativeCwId}"]`)).toHaveCount(0);

      const infoBtn = page.locator(`[data-testid="native-assignment-info-button-${sourceNativeCwId}"]`);
      const lockedOpenBtn = page.locator(`[data-testid="locked-open-assignment-button-${sourceNativeCwId}"]`);
      await expect(infoBtn).toBeVisible();
      await expect(lockedOpenBtn).toBeVisible();
      await expect(lockedOpenBtn).toContainText('Open');

      // Clicking the "i" icon opens the explanation modal (with no Clone button)
      await infoBtn.click();
      const infoModal = page.locator('[data-testid="native-assignment-info-modal"]');
      await expect(infoModal).toBeVisible();
      await expect(page.locator(`[data-testid="native-assignment-explanation-${sourceNativeCwId}"]`)).toContainText(
        'Google Classroom blocks third-party apps from writing grades or attaching feedback files'
      );
      await expect(page.locator(`[data-testid="modal-clone-assignment-button-${sourceNativeCwId}"]`)).toHaveCount(0);
      await page.locator('[data-testid="close-native-info-modal-button"]').click();
      await expect(infoModal).toBeHidden();

      // Clicking the disabled-styled "Open" button also opens the explanation modal
      await lockedOpenBtn.click();
      await expect(infoModal).toBeVisible();
      await expect(page.locator(`[data-testid="native-assignment-explanation-${sourceNativeCwId}"]`)).toContainText(
        'Google Classroom blocks third-party apps from writing grades or attaching feedback files'
      );
      await page.locator('[data-testid="close-native-info-modal-button"]').click();
      await expect(infoModal).toBeHidden();

      // Verify eligible assignments in the list have ONLY the active Open button (and no Clone button)
      const eligibleOpenBtn = page.locator('[data-testid^="open-assignment-button-"]').first();
      if ((await eligibleOpenBtn.count()) > 0) {
        const eligibleTestId = await eligibleOpenBtn.getAttribute('data-testid');
        const eligibleCwId = eligibleTestId!.replace('open-assignment-button-', '');
        await expect(page.locator(`[data-testid="clone-assignment-button-${eligibleCwId}"]`)).toHaveCount(0);
        await expect(page.locator(`[data-testid="open-assignment-button-${eligibleCwId}"]`)).toBeVisible();
      }

      // 2. Seed a rubric on the older assignment in Firestore to verify Copy Rubric during rubric creation
      await seedTestAssignment(`${targetCourseId}_${sourceNativeCwId}`, {
        courseId: targetCourseId,
        courseWorkId: sourceNativeCwId,
        title: 'Native Source Assignment',
        rubric: {
          id: `native_rubric_${sourceNativeCwId}`,
          title: 'Copied Rubric Verification',
          criteria: [
            {
              id: 'crit_copy_1',
              title: 'Cloned Criterion Alpha',
              description: 'Evaluates copied criterion accuracy',
              maxPoints: 60,
            },
            {
              id: 'crit_copy_2',
              title: 'Cloned Criterion Beta',
              description: 'Evaluates copied criterion completeness',
              maxPoints: 40,
            },
          ],
        },
      });

      // 3. Create a new assignment via "+ New Assignment"
      await page.locator('[data-testid="create-new-assignment-button"]').click();
      const createForm = page.locator('[data-testid="create-assignment-form"]');
      await expect(createForm).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid="cloning-source-banner"]')).toHaveCount(0);

      const newAssignmentTitle = `[E2E Test] Copy Rubric Target ${Date.now()}`;
      await page.locator('[data-testid="new-assignment-title-input"]').fill(newAssignmentTitle);

      const submitCreateBtn = page.locator('[data-testid="create-assignment-submit-button"]');
      await expect(submitCreateBtn).toBeEnabled();
      await submitCreateBtn.click();

      // 4. Verify the new assignment opens in a workspace tab without a rubric initially
      await expect(modal).toBeHidden({ timeout: 30000 });

      const openTab = page.locator(`[data-testid^="assignment-tab-${targetCourseId}_"]`).first();
      await expect(openTab).toBeVisible({ timeout: 15000 });
      await expect(openTab).toContainText(newAssignmentTitle);

      const tabTestId = await openTab.getAttribute('data-testid');
      const fullNewAssignmentId = tabTestId!.replace('assignment-tab-', '');
      clonedCourseWorkId = fullNewAssignmentId.replace(`${targetCourseId}_`, '');

      // 5. Click "Copy Rubric" in the Rubric Breakdown empty state
      const copyRubricBtn = page.locator('[data-testid="copy-rubric-button"]');
      await expect(copyRubricBtn).toBeVisible({ timeout: 15000 });
      await copyRubricBtn.click();

      const rubricModal = page.locator('[data-testid="rubric-edit-modal"]');
      await expect(rubricModal).toBeVisible();

      const copyPickerPanel = page.locator('[data-testid="copy-rubric-picker-panel"]');
      await expect(copyPickerPanel).toBeVisible();

      // Select the older assignment to copy its rubric
      const sourceRubricBtn = page.locator(`[data-testid="copy-rubric-source-${sourceNativeCwId}"]`);
      await expect(sourceRubricBtn).toBeVisible({ timeout: 15000 });
      await sourceRubricBtn.click();

      // Verify the picker closes and the copied rubric criteria populate the editor (with no rubric title input)
      await expect(copyPickerPanel).toBeHidden({ timeout: 10000 });
      await expect(page.locator('[data-testid="rubric-title-input"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="criterion-title-input-0"]')).toHaveValue('Cloned Criterion Alpha');
      await expect(page.locator('[data-testid="criterion-title-input-1"]')).toHaveValue('Cloned Criterion Beta');

      // Save the copied rubric
      await page.locator('[data-testid="save-rubric-modal-button"]').click();
      await expect(rubricModal).toBeHidden({ timeout: 15000 });

      // Verify the copied rubric is displayed in the workspace Rubric Breakdown zone
      const rubricZone = page.locator('[data-testid="rubric-breakdown-list"]');
      await expect(rubricZone).toBeVisible({ timeout: 15000 });
      await expect(rubricZone).toContainText('Cloned Criterion Alpha', { timeout: 15000 });
      await expect(rubricZone).toContainText('Cloned Criterion Beta', { timeout: 15000 });
    } finally {
      if (targetCourseId && sourceNativeCwId) {
        await cleanupTestAssignment(`${targetCourseId}_${sourceNativeCwId}`, []).catch(() => null);
      }
      if (targetCourseId && clonedCourseWorkId) {
        await deleteLiveClassroomAssignmentFixture(targetCourseId, clonedCourseWorkId).catch(() => null);
        await cleanupTestAssignment(`${targetCourseId}_${clonedCourseWorkId}`, []).catch(() => null);
      }
      if (targetCourseId) {
        await sweepOrphanedTestAssignments(targetCourseId).catch(() => null);
      }
    }
  });

  test('editAssignment_updateTitleAndPoints_updatesWorkspaceHeader_test', async ({ page }) => {
    let googleToken = '';
    let customToken = '';
    let createdCwId: string | null = null;
    let targetCourseId: string | null = null;
    try {
      const {
        getLiveTeacherAccessToken,
        getLiveTestTeacherCustomToken,
        testCourseId,
        createLiveClassroomAssignmentFixture,
        deleteLiveClassroomAssignmentFixture,
      } = await import('../helpers/classroomSandboxSeeder');

      targetCourseId = testCourseId;
      [googleToken, customToken] = await Promise.all([
        getLiveTeacherAccessToken(),
        getLiveTestTeacherCustomToken(),
      ]);

      const initialTitle = `[E2E Test] Editable CW ${Date.now()}`;
      const created = await createLiveClassroomAssignmentFixture(testCourseId, {
        title: initialTitle,
        description: 'Initial description',
        maxPoints: 50,
      });
      createdCwId = created.id;

      await page.addInitScript(
        ({ gToken, cToken }) => {
          if (gToken) window.sessionStorage.setItem('classroom_agent_google_access_token', gToken);
          if (cToken) window.sessionStorage.setItem('classroom_agent_custom_token', cToken);
        },
        { gToken: googleToken, cToken: customToken }
      );

      await page.goto('/');

      // Open assignment via + Assignment modal
      const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
      await expect(newAssignmentTabBtn).toBeVisible({ timeout: 15000 });
      await newAssignmentTabBtn.click();
      await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 15000 });

      const courseBtn = page.locator(`[data-testid="course-select-${targetCourseId}"]`);
      await expect(courseBtn).toBeVisible({ timeout: 15000 });
      await courseBtn.click();

      const openBtn = page.locator(`[data-testid="open-assignment-button-${createdCwId}"]`);
      await expect(openBtn).toBeVisible({ timeout: 15000 });
      await openBtn.click();

      // Verify workspace loads
      await expect(page.locator('[data-testid="student-roster-list"]')).toBeVisible({ timeout: 15000 });

      // Click Edit Assignment button in the top left header container
      const editBtn = page.locator('[data-testid="edit-assignment-button"]');
      await expect(editBtn).toBeVisible({ timeout: 10000 });
      await editBtn.click();

      const editModal = page.locator('[data-testid="edit-assignment-modal"]');
      await expect(editModal).toBeVisible({ timeout: 10000 });

      // Check current values
      const titleInput = page.locator('[data-testid="edit-assignment-title-input"]');
      await expect(titleInput).toHaveValue(initialTitle);
      const pointsInput = page.locator('[data-testid="edit-assignment-max-points-input"]');
      await expect(pointsInput).toHaveValue('50');

      // Update title and points
      const updatedTitle = `[E2E Test] Modified Title ${Date.now()}`;
      await titleInput.fill(updatedTitle);
      await pointsInput.fill('75');

      // Save changes
      await page.locator('[data-testid="save-edit-assignment-button"]').click();

      // Modal closes
      await expect(editModal).toBeHidden({ timeout: 15000 });

      // Workspace header reflects updated title and points
      await expect(page.locator('[data-testid="assignment-max-points"]')).toContainText('75 pts', { timeout: 10000 });
      await expect(page.locator('h2[title*="Modified Title"]')).toBeVisible({ timeout: 10000 });
    } finally {
      if (targetCourseId && createdCwId) {
        try {
          const { deleteLiveClassroomAssignmentFixture } = await import('../helpers/classroomSandboxSeeder');
          await deleteLiveClassroomAssignmentFixture(targetCourseId, createdCwId);
        } catch {
          // ignore cleanup
        }
      }
    }
  });
});







