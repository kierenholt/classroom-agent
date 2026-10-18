import { test, expect } from '../helpers/logHelper';
import { type Page } from '@playwright/test';
import {
  setupLiveClassroomBatchFixture,
  teardownLiveClassroomBatchFixture,
  LiveBatchFixture,
} from '../helpers/classroomSandboxSeeder';
import { seedTestAssignment, seedTestSubmission, cleanupTestAssignment } from '../helpers/testSeeder';

// Increase timeout for live Google Classroom + Gemini API E2E suite
test.setTimeout(120000);

/**
 * Helper to authenticate the browser context using the cached Teacher Google OAuth token,
 * navigate to '/', select the test course, and open the batch assignment in the 70/30 workspace.
 */
async function openBatchAssignmentInWorkspace(page: Page, fixture: LiveBatchFixture) {
  page.on('response', async (res) => {
    if (res.url().includes(':5001') && res.status() >= 400) {
      const body = await res.text().catch(() => '');
      console.log(`[Browser 5001 Error Response] ${res.status()} ${res.url()} -> ${body}`);
    }
  });

  await page.addInitScript(({ googleToken, customToken }) => {
    window.sessionStorage.setItem('classroom_agent_google_access_token', googleToken);
    window.sessionStorage.setItem('classroom_agent_custom_token', customToken);
  }, { googleToken: fixture.teacherAccessToken, customToken: fixture.customAuthToken });

  await page.goto('/');

  // Click "+ Assignment" button to open the Assignment Picker Modal
  const newAssignmentTabBtn = page.locator('[data-testid="new-assignment-tab-button"]');
  await expect(newAssignmentTabBtn).toBeVisible({ timeout: 30000 });
  await newAssignmentTabBtn.click();

  await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible({ timeout: 30000 });
  const courseBtn = page.locator(`[data-testid="course-select-${fixture.courseId}"]`);
  await expect(courseBtn).toBeVisible({ timeout: 30000 });
  await courseBtn.click();

  // Locate the specific batch assignment card by its unique courseWorkId, select it, and click OK
  await expect(page.locator('[data-testid="assignment-picker-section"]')).toBeVisible({ timeout: 30000 });
  const assignmentCard = page.locator(`[data-testid="assignment-card-${fixture.courseWork.id}"]`);
  await expect(assignmentCard).toBeVisible({ timeout: 30000 });
  await assignmentCard.click();

  const okBtn = page.locator('[data-testid="assignment-picker-ok-button"]');
  await expect(okBtn).toBeEnabled();
  await okBtn.click();

  // Verify the assignment tab is active and the 3 zones + ChatPanel are mounted
  await expect(page.locator(`[data-testid="assignment-tab-${fixture.assignmentId}"]`)).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-testid="student-roster-list"]')).toBeVisible({ timeout: 30000 });
}

test.describe('Classroom Agent MVP — 7 Core User Stories (Live Classroom Batch Suite)', () => {
  let batchFixture: LiveBatchFixture | null = null;

  // 1. BATCH SETUP: Runs ONCE for all 7 user stories
  test.beforeAll(async () => {
    batchFixture = await setupLiveClassroomBatchFixture({
      maxPoints: 100,
    });
    console.log(
      `[E2E Batch Setup] Ready: assignmentId=${batchFixture.assignmentId}, title="${batchFixture.courseWork.title}", student=${batchFixture.student.fullName}, submissionId=${batchFixture.submissionId}`
    );
  });

  // 2. LIGHTWEIGHT SIDECAR RESET: 0 Google Classroom API calls between tests
  test.afterEach(async () => {
    if (batchFixture) {
      await cleanupTestAssignment(batchFixture.assignmentId, [batchFixture.student.userId]);
    }
  });

  // 3. BATCH TEARDOWN: Runs ONCE after all 7 user stories finish
  test.afterAll(async () => {
    if (batchFixture) {
      console.log(
        `[E2E Batch Teardown] Deleting coursework ${batchFixture.courseWork.id} & Drive file ${batchFixture.driveFileId} in parallel...`
      );
      await teardownLiveClassroomBatchFixture(batchFixture);
      batchFixture = null;
      console.log('[E2E Batch Teardown] Complete.');
    }
  });

  // =========================================================================
  // US-1: Browse Courses & Open Assignment in Tabbed Workspace
  // =========================================================================
  test('openAssignment_courseAndCourseworkLoaded_opensWorkspaceTabAndRendersThreeZones_test', async ({ page }) => {
    expect(batchFixture).not.toBeNull();
    await openBatchAssignmentInWorkspace(page, batchFixture!);

    // Assert Top Tab Bar displays the opened assignment tab
    await expect(page.locator('[data-testid="assignment-tab-bar"]')).toBeVisible();
    await expect(page.locator(`[data-testid="assignment-tab-${batchFixture!.assignmentId}"]`)).toContainText(
      batchFixture!.courseWork.title
    );

    // Assert all 3 Workspace Zones (Zone A Roster, Zone B Preview, Zone C Grading) + 30% Agent Chat Pane are visible
    await expect(page.locator('[data-testid="student-roster-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="submission-preview-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="rubric-breakdown-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-window"]')).toBeVisible();
  });

  // =========================================================================
  // US-2: Inspect Live Student Roster, Search & Status Filters (Zone A)
  // =========================================================================
  test('filterStudentRoster_turnedInStudentPresent_filtersBySearchAndSubmissionStatus_test', async ({ page }) => {
    expect(batchFixture).not.toBeNull();
    await openBatchAssignmentInWorkspace(page, batchFixture!);

    const studentRow = page.locator(`[data-testid="student-row-${batchFixture!.student.userId}"]`);
    await expect(studentRow).toBeVisible();
    await expect(studentRow).toContainText('Turned In');

    // Filter by "TURNED IN" pill -> student remains visible
    const filterPills = page.locator('[data-testid="student-filter-pills"]');
    await filterPills.locator('button', { hasText: 'TURNED IN' }).click();
    await expect(studentRow).toBeVisible();

    // Filter by "MISSING" pill -> turned-in student is hidden
    await filterPills.locator('button', { hasText: 'MISSING' }).click();
    await expect(studentRow).toHaveCount(0);

    // Reset filter to "ALL" -> student is visible again
    await filterPills.locator('button', { hasText: 'ALL' }).click();
    await expect(studentRow).toBeVisible();
  });

  // =========================================================================
  // US-3: Preview Student Submission Attachment (Zone B)
  // =========================================================================
  test('previewStudentSubmission_studentWithDriveAttachmentSelected_rendersAttachmentContentInPreviewZone_test', async ({
    page,
  }) => {
    expect(batchFixture).not.toBeNull();
    await openBatchAssignmentInWorkspace(page, batchFixture!);

    // Click student row in Zone A
    const studentRow = page.locator(`[data-testid="student-row-${batchFixture!.student.userId}"]`);
    await studentRow.click();

    // Verify attachment switcher shows the uploaded Python file
    const attachmentSwitcher = page.locator('[data-testid="attachment-switcher"]');
    await expect(attachmentSwitcher).toBeVisible();
    await expect(attachmentSwitcher).toContainText('recursion_solution.py');

    // Verify Zone B fetches and renders the live code content from Google Drive
    const codeBlock = page.locator('[data-testid="preview-code-block"]');
    await expect(codeBlock).toBeVisible({ timeout: 30000 });
    await expect(codeBlock).toContainText('def factorial(n: int) -> int:');
  });

  // =========================================================================
  // US-3B: Read Submitted Google Document Content (Google Docs Export -> Zone B & Agent Tool)
  // =========================================================================
  test('readSubmittedGoogleDoc_studentWithGoogleDocAttachment_extractsAndReadsGoogleDocContent_test', async ({
    page,
  }) => {
    expect(batchFixture).not.toBeNull();
    await openBatchAssignmentInWorkspace(page, batchFixture!);

    // Select the student row in Zone A
    const studentRow = page.locator(`[data-testid="student-row-${batchFixture!.student.userId}"]`);
    await studentRow.click();

    // Verify the attachment switcher includes the student's submitted Google Document and select it
    const attachmentSwitcher = page.locator('[data-testid="attachment-switcher"]');
    await expect(attachmentSwitcher).toBeVisible();
    await expect(attachmentSwitcher).toContainText(batchFixture!.googleDocTitle);

    const googleDocTab = page.locator(`[data-testid="attachment-tab-${batchFixture!.googleDocFileId}"]`);
    await expect(googleDocTab).toBeVisible();
    await googleDocTab.click();

    // Verify Zone B renders the authenticated Google Document PDF preview frame
    const pdfFrame = page.locator('[data-testid="preview-pdf-frame"]');
    await expect(pdfFrame).toBeVisible({ timeout: 30000 });
    await expect(pdfFrame).toHaveAttribute('src', /^blob:/);

    // By default, the Extracted Text toggle button is hidden (setting defaults to off)
    const toggleTextBtn = page.locator('[data-testid="toggle-extracted-text-button"]');
    await expect(toggleTextBtn).toBeHidden();

    // Open Settings modal and enable "Show Extracted Text Toggle"
    await page.locator('[data-testid="open-settings-button"]').click();
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
    await page.locator('[data-testid="toggle-extracted-text-setting"]').click();
    await page.locator('[data-testid="close-settings-button"]').click();
    await expect(page.locator('[data-testid="settings-modal"]')).toBeHidden();

    // Toggle to "Extracted Text" view in Zone B and assert the Google Document text is rendered directly in the preview canvas
    await expect(toggleTextBtn).toBeVisible({ timeout: 30000 });
    await toggleTextBtn.click();

    const previewTextContent = page.locator('[data-testid="preview-text-content"]');
    await expect(previewTextContent).toBeVisible();
    await expect(previewTextContent).toContainText(batchFixture!.googleDocContent);

    // Prompt the Agent Co-Pilot to read the student's submitted Google Document content
    const chatInput = page.locator('[data-testid="chat-input"]');
    const chatSendBtn = page.locator('[data-testid="chat-send-button"]');

    await chatInput.fill(
      `Call get_student_submission_content now for studentId "${batchFixture!.student.userId}" and quote the Thesis Statement from their Google Doc "${batchFixture!.googleDocTitle}".`
    );
    await chatSendBtn.click();

    // Wait for get_student_submission_content tool call to succeed and streaming to complete
    const toolBadge = page.locator('[data-testid="tool-call-badge"]', {
      hasText: 'Tool: get_student_submission_content',
    });
    await expect(toolBadge).toBeVisible({ timeout: 60000 });
    await expect(toolBadge).toContainText('success', { timeout: 60000 });
    await expect(chatInput).toBeEnabled({ timeout: 60000 });

    // Expand the tool call badge details if collapsed after Firestore reconciliation
    const toolDetails = toolBadge.locator('[data-testid="tool-call-details"]');
    if (!(await toolDetails.isVisible())) {
      await toolBadge.locator('[data-testid="tool-call-header"]').click();
    }

    // Assert the extracted Google Document text content and GOOGLE_DOC type are read from Google Drive
    await expect(toolDetails).toBeVisible();
    await expect(toolDetails).toContainText('GOOGLE_DOC');
    await expect(toolDetails).toContainText(batchFixture!.googleDocTitle);
    await expect(toolDetails).toContainText(batchFixture!.googleDocContent);

    // Assert the Agent's response in the chat window quotes the content read from the Google Document
    await expect(page.locator('[data-testid="chat-window"]')).toContainText(
      'Recursive factorial algorithms operate in O(n) linear time complexity'
    );
  });

  // =========================================================================
  // US-4: Create / Configure Grading Rubric via Agent Co-Pilot (30% Pane -> Zone C)
  // =========================================================================
  test('setAssignmentRubric_agentPromptSubmitted_streamsToolBadgeAndRendersRubricCriteriaInZoneC_test', async ({
    page,
  }) => {
    expect(batchFixture).not.toBeNull();
    await openBatchAssignmentInWorkspace(page, batchFixture!);

    const chatInput = page.locator('[data-testid="chat-input"]');
    const chatSendBtn = page.locator('[data-testid="chat-send-button"]');

    await chatInput.fill(
      'Call set_assignment_rubric now to create a 2-criterion rubric totaling 100 points: 1) crit_correctness (Recursive Logic, 60 pts) and 2) crit_style (Documentation & Style, 40 pts).'
    );
    await chatSendBtn.click();

    // Assert ToolCallBadge appears in 30% Agent Pane for set_assignment_rubric
    await expect(
      page.locator('[data-testid="tool-call-badge"]', { hasText: 'Tool: set_assignment_rubric' })
    ).toBeVisible({ timeout: 60000 });

    // Assert Zone C automatically updates via Firestore Sidecar onSnapshot to render the rubric criteria
    const rubricList = page.locator('[data-testid="rubric-breakdown-list"]');
    await expect(rubricList.locator('[data-testid^="rubric-criterion-"]').first()).toBeVisible({ timeout: 60000 });
  });

  // =========================================================================
  // US-5: AI Agent Evaluates & Draft-Grades Student Submission (30% Pane -> Classroom API + Sidecar)
  // =========================================================================
  test('evaluateAndGradeSubmission_turnedInSubmissionWithRubric_gradesSubmissionAndSyncsDraftToClassroom_test', async ({
    page,
  }) => {
    expect(batchFixture).not.toBeNull();

    // Seed deterministic 2-criterion rubric in Sidecar so this test is 100% self-contained
    await seedTestAssignment(batchFixture!.assignmentId, {
      rubric: {
        id: 'rubric_e2e_us5',
        title: 'Recursion Evaluation Rubric',
        criteria: [
          { id: 'crit_logic', title: 'Recursive Base & Step Case', description: 'Correct n! logic', maxPoints: 60 },
          { id: 'crit_docs', title: 'Type Hints & Docstring', description: 'Clean Python docstring', maxPoints: 40 },
        ],
      },
    });

    await openBatchAssignmentInWorkspace(page, batchFixture!);

    // Select the student in Zone A
    const studentRow = page.locator(`[data-testid="student-row-${batchFixture!.student.userId}"]`);
    await studentRow.click();

    // Prompt the Agent Co-Pilot to inspect and grade the selected student's submission
    const chatInput = page.locator('[data-testid="chat-input"]');
    const chatSendBtn = page.locator('[data-testid="chat-send-button"]');

    await chatInput.fill(
      `Read and grade the submission for studentId "${batchFixture!.student.userId}" using get_student_submission_content and evaluate_and_grade_submission against the rubric.`
    );
    await chatSendBtn.click();

    // Verify tool call badge for evaluate_and_grade_submission appears in the 30% pane
    await expect(
      page.locator('[data-testid="tool-call-badge"]', { hasText: 'Tool: evaluate_and_grade_submission' })
    ).toBeVisible({ timeout: 90000 });

    // Verify Zone A & Zone C update in real time with grade, status, and agent feedback in chat
    await expect(studentRow).toContainText(/Draft Graded|Returned/, {
      timeout: 30000,
    });
    const totalGradeInput = page.locator('[data-testid="total-grade-input"]');
    await expect(totalGradeInput).not.toHaveValue('', { timeout: 30000 });
    // Agent feedback is delivered exclusively in the chat co-pilot window
    await expect(page.locator('[data-testid="chat-window"]')).toContainText(/evaluated|graded|score|factorial|recursion/i, {
      timeout: 30000,
    });
    // Submission comments section is removed from Zone C
    await expect(page.locator('[data-testid="submission-comments-section"]')).toBeHidden();
  });

  // =========================================================================
  // US-7: Multi-Tab Session Persistence (flex / hidden DOM State Preservation)
  // =========================================================================
  test('switchWorkspaceTabs_activeSessionWithDraftInput_preservesDomStateAndSelectedStudent_test', async ({ page }) => {
    expect(batchFixture).not.toBeNull();
    await openBatchAssignmentInWorkspace(page, batchFixture!);

    // Type an unsent draft prompt in the 30% Agent Pane
    const draftMessage = 'Unsent draft prompt that must survive tab switching';
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill(draftMessage);
    await expect(chatInput).toHaveValue(draftMessage);

    // Open "+ Assignment" modal
    await page.locator('[data-testid="new-assignment-tab-button"]').click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeVisible();

    // Close modal and return to the open Assignment Tab
    await page.locator('[data-testid="assignment-picker-cancel-button"]').click();
    await expect(page.locator('[data-testid="assignment-picker-modal"]')).toBeHidden();

    // Verify the unsent chat input draft and active student selection are preserved without unmounting
    await expect(chatInput).toHaveValue(draftMessage);
    await expect(page.locator('[data-testid="submission-preview-container"]')).toContainText('recursion_solution.py');
  });

  // =========================================================================
  // US-6: Manual Teacher Grade Adjustment & Return to Student (Zone A -> Classroom API)
  // =========================================================================
  test('returnSubmission_draftGradedStudent_promotesAssignedGradeAndReturnsInClassroom_test', async ({ page }) => {
    expect(batchFixture).not.toBeNull();

    // Pre-seed rubric & initial draft grade in Sidecar
    await seedTestAssignment(batchFixture!.assignmentId, {
      rubric: {
        id: 'rubric_e2e_us6',
        title: 'Final Return Rubric',
        criteria: [
          { id: 'crit_logic', title: 'Recursive Logic', description: 'Correct factorial', maxPoints: 60 },
          { id: 'crit_docs', title: 'Code Style', description: 'Clean docstring', maxPoints: 40 },
        ],
      },
    });
    await seedTestSubmission(batchFixture!.assignmentId, batchFixture!.student.userId, {
      submissionId: batchFixture!.submissionId,
      draftGrade: 90,
      overallFeedback: 'Great recursive solution.',
      classroomSyncStatus: 'SYNCED_DRAFT',
      rubricBreakdown: [
        { criterionId: 'crit_logic', score: 55, comment: 'Solid base case' },
        { criterionId: 'crit_docs', score: 35, comment: 'Clear docstring' },
      ],
      comments: [],
    });

    await openBatchAssignmentInWorkspace(page, batchFixture!);

    // Adjust total score manually to 95 in the left sidebar and check the student checkbox to reveal Save Draft & Return
    const totalGradeInput = page.locator('[data-testid="total-grade-input"]');
    await expect(totalGradeInput).toHaveValue('90');
    await totalGradeInput.fill('95');

    const studentCheckbox = page.locator(`[data-testid="student-checkbox-${batchFixture!.student.userId}"]`);
    await studentCheckbox.check();

    await page.locator('[data-testid="save-draft-grade-button"]').click();
    await expect(page.locator(`[data-testid="student-row-${batchFixture!.student.userId}"]`)).toContainText(
      /Draft Graded|Returned/,
      { timeout: 30000 }
    );
    await expect(page.locator(`[data-testid="student-grade-badge-${batchFixture!.student.userId}"]`)).toContainText(
      /95|100/
    );

    // Click Return to officially return the grade to the student in Google Classroom
    await page.locator('[data-testid="return-submission-button"]').click();
    await expect(page.locator(`[data-testid="student-row-${batchFixture!.student.userId}"]`)).toContainText(
      'Returned',
      { timeout: 30000 }
    );
  });
});
