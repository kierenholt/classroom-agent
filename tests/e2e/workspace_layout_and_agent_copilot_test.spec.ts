import { test, expect } from '../helpers/logHelper';
import { seedTestAssignment, seedTestSubmission, cleanupTestAssignment, seedTestChatMessage } from '../helpers/testSeeder';

const TEST_ASSIGNMENT_ID = 'test_course_101_assignment_999';
const TEST_STUDENT_ID = 'student_test_user_42';

test.describe('Classroom Agent - Workspace and Agent Co-Pilot Tests', () => {
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

    // When unauthenticated, the application presents the Google Classroom sign-in dialog
    const signInButton = page.locator('button:has-text("Sign in with Google Classroom")');
    await expect(signInButton).toBeVisible();
    await expect(page.locator('text=Classroom Agent')).toBeVisible();
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
    // Before selecting a class, the assignment picker section is hidden and OK button is disabled
    await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="assignment-picker-ok-button"]')).toBeDisabled();
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

    // Find an active course that contains coursework, select the assignment, and click OK
    const courseButtons = page.locator('[data-testid^="course-select-"]');
    await expect(courseButtons.first()).toBeVisible({ timeout: 15000 });
    const courseCount = await courseButtons.count();
    let opened = false;
    for (let i = 0; i < courseCount; i++) {
      await courseButtons.nth(i).click();
      await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 5000 });
      const assignmentCard = page.locator('[data-testid^="assignment-card-"]').first();
      try {
        await expect(assignmentCard).toBeVisible({ timeout: 5000 });
        await assignmentCard.click();
        const okBtn = page.locator('[data-testid="assignment-picker-ok-button"]');
        await expect(okBtn).toBeEnabled();
        await okBtn.click();
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

    const openTab = page.locator('[data-testid^="assignment-tab-"]').first();
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
      // Assert markdown-content container renders in the chat window
      const mdContent = page.locator('[data-testid="markdown-content"]');
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
      const assignmentCard = page.locator('[data-testid^="assignment-card-"]').first();
      try {
        await expect(assignmentCard).toBeVisible({ timeout: 5000 });
        await assignmentCard.click();
        const okBtn = page.locator('[data-testid="assignment-picker-ok-button"]');
        await expect(okBtn).toBeEnabled();
        await okBtn.click();
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
    await rubricSettingSwitch.click();
    await expect(rubricSettingSwitch).toHaveAttribute('aria-checked', 'true');
    await page.locator('[data-testid="close-settings-button"]').click();
    await expect(rubricBreakdownList).toBeVisible();
    await expect(page.locator('[data-testid="overall-feedback-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="overall-feedback-input"]')).toBeHidden();
    await expect(page.locator('[data-testid="submission-comments-section"]')).toBeHidden();
    await expect(page.locator('[data-testid="submission-comment-input"]')).toBeHidden();
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
      const assignmentCard = page.locator('[data-testid^="assignment-card-"]').first();
      try {
        await expect(assignmentCard).toBeVisible({ timeout: 5000 });
        await assignmentCard.click();
        const okBtn = page.locator('[data-testid="assignment-picker-ok-button"]');
        await expect(okBtn).toBeEnabled();
        await okBtn.click();
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

    // Initially, the student checkbox is unchecked
    await expect(studentCheckbox).not.toBeChecked();

    // 1. Click anywhere on the student row (e.g. on the row container) -> toggles checkbox to checked
    await firstStudentRow.click();
    await expect(studentCheckbox).toBeChecked();
    await expect(page.locator('[data-testid="save-draft-grade-button"]')).toBeVisible();

    // 2. Click the row again -> toggles checkbox to unchecked
    await firstStudentRow.click();
    await expect(studentCheckbox).not.toBeChecked();
    await expect(page.locator('[data-testid="save-draft-grade-button"]')).toBeHidden();

    // 3. Click directly on the checkbox -> toggles checkbox to checked
    await studentCheckbox.click();
    await expect(studentCheckbox).toBeChecked();
    await expect(page.locator('[data-testid="save-draft-grade-button"]')).toBeVisible();

    // 4. Click directly on the checkbox again -> toggles checkbox to unchecked
    await studentCheckbox.click();
    await expect(studentCheckbox).not.toBeChecked();
    await expect(page.locator('[data-testid="save-draft-grade-button"]')).toBeHidden();
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
      const assignmentCard = page.locator('[data-testid^="assignment-card-"]').first();
      try {
        await expect(assignmentCard).toBeVisible({ timeout: 5000 });
        await assignmentCard.click();
        const okBtn = page.locator('[data-testid="assignment-picker-ok-button"]');
        await expect(okBtn).toBeEnabled();
        await okBtn.click();
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
  });

  test('studentAvatar_studentWithInitialsAndAvatarUrl_rendersGoogleAvatarWithInitialsFallback_test', async ({ page }) => {
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
      const assignmentCard = page.locator('[data-testid^="assignment-card-"]').first();
      try {
        await expect(assignmentCard).toBeVisible({ timeout: 5000 });
        await assignmentCard.click();
        const okBtn = page.locator('[data-testid="assignment-picker-ok-button"]');
        await expect(okBtn).toBeEnabled();
        await okBtn.click();
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

    // Locate the student avatar element
    const avatar = firstStudentRow.locator('[data-testid^="student-avatar-"]');
    await expect(avatar).toBeVisible();

    // Verify it is either an <img> tag with a Google avatar or a <div> with uppercase initials / fallback icon
    const tagName = await avatar.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'img') {
      const src = await avatar.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).toMatch(/^https?:\/\//);
    } else {
      expect(tagName).toBe('div');
      const text = await avatar.textContent();
      if (text && text.trim().length > 0) {
        expect(text.trim()).toMatch(/^[A-Z]{1,2}$/);
      } else {
        await expect(avatar.locator('svg')).toBeVisible();
      }
    }
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
});

