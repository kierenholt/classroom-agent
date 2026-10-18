export const USER_GUIDE_MARKDOWN = `# Classroom Agent — Complete User Guide & Technical Support Reference

## 1. Overview & Layout
Classroom Agent is an AI-native grading and feedback workstation for Google Classroom built around a **70% Tabbed Assignment Workspace + 30% Persistent Streaming Agent Co-Pilot Pane** layout:
- **Top Tab Bar**: Displays your open assignment tabs, the **\`+ Assignment\`** button (to open or create assignments), and your **Account Profile Button** (top-right, showing your name/avatar and a dropdown menu for **Top up credits**, **Workspace Settings**, and **Sign Out**).
- **Left 70% — Assignment Workspace**:
  - **Zone A (Left 22% — Student Roster)**: Displays the linked Course & Assignment title (with a direct link icon to open the assignment in Google Classroom), a live Sync/Refresh button, status filter pills (\`All\`, \`Turned In\`, \`Unmarked\`, \`Draft\`, \`Returned\`, \`Missing\`), a searchable/selectable student list with checkboxes and inline editable score inputs, and the bottom **Grading Action Bar**.
  - **Zone B (Right 78% — Submission Preview Canvas)**: Renders student attachments (Google Docs, Slides, Sheets, PDFs, Code files, Images, Links, or Short Answers) in a fast, cached multi-tab preview viewer. When a feedback Google Doc is approved for a student, it appears here as a dedicated **\`Feedback - ...\`** tab alongside their submitted files.
  - **Zone C (Bottom of Zone B — Rubric Breakdown Pane)**: Displays the active grading rubric criteria, per-criterion scores, and descriptions. Contains the **\`Edit Rubric\`** button (or **\`Create Rubric\`** button if no rubric exists yet). Can be shown or hidden via Workspace Settings.
- **Right 30% — Grading Agent Co-Pilot Pane**:
  - **Header**: Displays the **\`Credits · Top Up\`** button showing your live remaining AI credits balance.
  - **Chat Stream**: Shows your conversation with the AI Grading Agent, interactive **Staged Evaluation Cards** (with **\`Preview\`**, **\`Approve\`**, and **\`Approve All\`** buttons), and **Created Assignment Cards** (with an **\`Open in New Tab\`** button). Each agent message also has a **\`Minimise\`** / **\`Expand\`** toggle in the top-right of the bubble.
  - **Quick Actions Bar**: A horizontal row of one-click prompt pills directly above the chat input box (e.g., \`Grade Selected\`, \`Grade All Turn-ins\`, \`Generate Rubric\`).
  - **Chat Input Bar**: Supports multi-line text prompts and a **Paperclip (\`Attach File\`)** button to upload PDF/document reference files or rubric documents directly to the agent.

---

## 2. Navigation, Tabs & Managing Assignments

### How to Open an Existing Assignment
1. Click the **\`+ Assignment\`** button in the Top Tab Bar.
2. In the **Select Assignment** modal:
   - **Step 1 (Select Class)**: Click on any of your active Google Classroom courses on the left.
   - **Step 2 (Select Assignment)**: Click on an assignment from that course on the right, then click **\`OK\`** (or double-click the assignment).
3. The assignment opens in a persistent tab in the Top Tab Bar. You can open multiple assignments across different courses simultaneously and switch between them at any time without losing your chat stream, scroll position, or unsaved edits.
4. If you recently created a class or assignment inside Google Classroom and don't see it yet, click the **\`Refresh\`** icon in the top-right of the Assignment Picker modal.

### How to Switch or Close Assignment Tabs
- **Switch Tabs**: Click any tab in the Top Tab Bar to bring that assignment and its dedicated Agent Co-Pilot chat session into focus.
- **Close a Tab**: Click the \`×\` icon on the right side of any tab in the Top Tab Bar.

### How to Create a New Assignment in Google Classroom
You can create a new Google Classroom assignment in two ways:
1. **Via the \`+ Assignment\` Modal (Manual UI)**:
   - Click **\`+ Assignment\`** in the Top Tab Bar and select a class.
   - Click the **\`+ New Assignment\`** button in the assignment list header.
   - Fill in the **Title**, **Instructions / Description**, **Max Points**, and optional **Due Date**, then click **\`Create & Open\`**.
2. **Via the Grading Agent Co-Pilot (AI Assisted)**:
   - Ask the agent in chat (e.g., *"Create a new follow-up assignment in this class titled 'Recursion Practice' worth 50 points"* or *"Create a new assignment in my Biology class"*).
   - The agent will call \`create_classroom_assignment\` (and can optionally attach an initial grading rubric at the same time).
   - Once created, a card appears in the chat with an **\`Open in New Tab\`** button so you can jump straight into the new assignment workspace.

---

## 3. How AI Grading, Previewing & Approving Works

### Step 1: Ask the Agent to Evaluate
- **Single Student**: Click a student in the left Student Roster (Zone A) to select them, then click the **\`Grade Selected\`** quick action pill or ask *"Evaluate and grade the selected student's submission"*.
- **Multiple Checked Students**: Check the boxes next to specific students in the Student Roster, then ask *"Grade the checked students"*.
- **All Ungraded Turn-ins**: Click the **\`Grade All Turn-ins\`** quick action pill or ask *"Mark all turned-in ungraded submissions"*.
- **Score-Only or Feedback-Only**: You can also ask the agent to *"Only propose numerical scores without written feedback"* or *"Only write feedback documents without scores"*.

### Step 2: Review Staged Evaluations in Chat
- When the agent finishes evaluating a student, it stages the proposed score, rubric criterion breakdown, and written feedback in the workspace sidecar (\`PENDING_APPROVAL\`) and displays an interactive **Evaluation Card** inside the agent chat bubble.
- **Nothing is published to students or written to Google Classroom until you approve it.**

### Step 3: Preview & Edit Feedback Before Approving
- Click the **\`Preview\`** button on any student's Evaluation Card in the chat panel.
- This opens the **Feedback Preview & Edit Modal**, where you can:
  - Inspect and edit the **Proposed Score** (numerical input).
  - Switch between **\`Rendered Preview\`** (formatted Markdown view) and **\`Edit Markdown\`** (raw text editor) to customize the written feedback before the student sees it.
  - Click **\`Approve & Sync to Classroom\`** right from the modal, or click **\`Cancel\`** to close.

### Step 4: Approve (Single or Batch)
- Click **\`Approve\`** on an individual student's Evaluation Card in chat, or click **\`Approve All (N)\`** at the top of the Evaluation Card list to approve all staged evaluations in that message at once.
- **What happens when you click Approve**:
  1. If the evaluation includes written feedback, Classroom Agent automatically generates a formatted **Google Doc** (\`Feedback - <Assignment Title> - <Student Name>\`), attaches it to the student's Google Classroom submission, and adds it as a previewable tab in Zone B.
  2. Depending on your **Grading Mode** setting (see Section 4 below):
     - In **No Draft Mode (Default)**: The numerical grade is assigned and the submission is officially **Returned / Published** to the student in Google Classroom in one step.
     - In **Draft Mode**: The numerical grade is saved to Google Classroom as an unreturned **Draft Grade** (\`draftGrade\`) so you can review all grades before returning them later.

---

## 4. Grading Modes & Manual Roster Grading

### Grading Modes: "No Draft Mode" vs. "Draft Mode"
You can switch your Grading Mode in **Account Menu (top-right) $\rightarrow$ Workspace Settings $\rightarrow$ Feedback & Grading $\rightarrow$ Grading Mode**:
1. **No Draft Mode (Direct to Final — Default)**:
   - Designed for fast, single-step grading.
   - Clicking **\`Approve\`** in the chat panel immediately publishes the final \`assignedGrade\` and returns the submission to the student in Google Classroom.
   - In the left Student Roster (Zone A), the bottom action bar displays a single **\`Return / Publish (N)\`** button.
2. **Draft Mode (Review Before Final)**:
   - Designed for two-stage grading where you want to hold grades as drafts before releasing them to the class.
   - Clicking **\`Approve\`** in the chat panel attaches the feedback Google Doc and saves the score as a **\`draftGrade\`** in Google Classroom without returning the submission.
   - In the left Student Roster (Zone A), the bottom action bar displays two buttons: **\`Save Draft (N)\`** and **\`Return (N)\`**.

### Manual Grading & Batch Actions in the Student Roster (Zone A)
- **Inline Score Editing**: You can type or adjust a student's numerical score directly in the score input box on their row in the Student Roster, or adjust individual criterion scores in the bottom **Rubric Breakdown Pane (Zone C)**.
- **Selecting Students for Batch Actions**:
  - Click the checkbox on individual student rows, or click the master checkbox in the roster header to select/deselect all visible students in the current filter.
  - If no checkboxes are ticked, the bottom action button acts on the currently focused student (1). If $N$ students are checked, the button acts on all $N$ checked students.
  - You can also ask the agent in chat: *"Return all graded submissions to students"* (which invokes \`return_student_submissions\`).

---

## 5. Rubrics: Importing, AI Generation & Manual Editing

### Automatic Import from Google Classroom
- When you open an assignment, if that assignment already has a rubric attached in Google Classroom, Classroom Agent automatically imports its criteria and point values into the workspace.

### Generating or Updating a Rubric with the Agent
- You can ask the agent to create or modify a rubric at any time:
  - Click the **\`Generate Rubric\`** quick action pill, or type *"Create a 4-criterion rubric worth 100 points based on the assignment instructions"*.
  - You can also attach a PDF/Doc rubric file using the **Paperclip (\`Attach File\`)** button in chat and say *"Set the assignment rubric from this attached file"*.
- The agent will call \`set_assignment_rubric\` and immediately update the **Rubric Breakdown Pane (Zone C)**.

### Manually Creating or Editing a Rubric in the UI
1. Look at the **Rubric Breakdown Pane (Zone C)** at the bottom of the center preview area.
   - *(Note: If the Rubric Pane is hidden, enable it via **Account Menu $\rightarrow$ Workspace Settings $\rightarrow$ Workspace Display $\rightarrow$ Show Rubric Pane**).*
2. Click **\`Edit Rubric\`** (top-right of the Rubric Pane) or **\`Create Rubric\`** (if no rubric exists yet).
3. In the **Edit Rubric Modal**:
   - Edit the **Rubric Title**.
   - Click **\`+ Add Criterion\`** to add new criteria, or click the **Trash icon** to delete a criterion.
   - Edit each criterion's **Title**, **Max Points**, and **Description**. The modal calculates the total rubric points live.
   - Click **\`Save Rubric\`** to save your changes.

---

## 6. Workspace Settings & Customizing the Agent
To open Workspace Settings, click your **Account Profile Button** in the top-right corner of the Top Tab Bar and select **\`Workspace Settings\`**. There are four tabs:

### Tab 1: Feedback & Grading
- **Grading Mode**: Switch between \`No Draft Mode (Direct to Final)\` and \`Draft Mode (Review Before Final)\`.
- **Tone**: Controls the voice of AI-generated student feedback (\`Encouraging & Supportive\`, \`Constructive & Balanced\`, \`Direct & Concise\`, \`Formal & Academic\`, or \`Warm & Mentorship-focused\`).
- **Level of Detail**: Controls feedback length and depth (\`Brief / Summary\`, \`Standard / Balanced\`, or \`Comprehensive / Deep-Dive\`).
- **Use Rubric During Feedback** *(On/Off)*: When ON, the agent evaluates against each rubric criterion and populates criterion scores. When OFF, the agent evaluates holistically against the assignment description without referencing rubric criteria.
- **Provide Next Steps** *(On/Off)*: Controls whether the agent includes a *"Next Steps"* section with actionable improvement recommendations in student feedback.
- **Show Scores** *(On/Off)*: When OFF, the agent omits all numerical scores/fractions (e.g. \`85/100\`) from its written feedback and chat response while still recording the numerical grade in the workspace.
- **Custom Agent Instructions**: A free-text box where you can give persistent instructions that apply to every prompt (e.g., *"Always write feedback in British English"*, *"Deduct 5 points for missing citations"*, or *"Address the student by their first name"*).

### Tab 2: Workspace Display
- **Show Rubric Pane** *(On/Off)*: Shows or hides the Rubric Breakdown Pane (Zone C) at the bottom of the submission preview canvas.

### Tab 3: Advanced
- **Show Extracted Text Toggle** *(On/Off, default Off)*: When enabled, displays an **\`Extracted Text\`** button in the top-right of the Submission Preview Canvas (Zone B) so you can inspect the raw plain-text extraction that the AI reads from a student's file.
- **Show Tool Calls** *(On/Off, default Off)*: When enabled, displays collapsible telemetry badges inside agent chat bubbles showing the exact tools (\`get_student_submission_content\`, \`evaluate_and_grade_submission\`, etc.), arguments, and results executed by the agent.

### Tab 4: Quick Actions
- **Show Quick Action Buttons** *(Master Toggle On/Off)*: Shows or hides the horizontal Quick Actions bar above the chat input box.
- **Toggle Built-in Prompts**: Enable or disable built-in pills (\`Grade Selected\`, \`Grade All Turn-ins\`, \`Generate Rubric\`, \`Follow-up Task\`, \`Class Summary\`).
- **Add Custom Quick Actions**: Click **\`+ Add Custom Action\`** to create your own one-click prompt buttons with a custom label and prompt text, edit or delete custom buttons, or click **\`Reset to Defaults\`**.

---

## 7. AI Credits & Billing

### How AI Credits Work
- Every new teacher account starts with **100 free AI credits**.
- **When credits are deducted**: Calling the chat agent for general questions, rubric generation, or help costs **0 credits**. Exactly **1 AI credit** is deducted each time the agent reads a student's submission via \`get_student_submission_content\`.
- Note: You must have at least **1 AI credit** (\`aiCredits > 0\`) to send messages to the Grading Agent.

### How to Check Your Balance & Top Up Credits
1. Your live credit balance is always visible in two places:
   - The gold **\`<N> Credits · Top Up\`** button in the top-right header of the **Grading Agent Co-Pilot** pane.
   - Inside the **Account Profile Dropdown Menu** (top-right of the Top Tab Bar) next to **\`Top up credits\`**.
2. Click either button to open the **Top Up AI Credits Modal**:
   - Shows your current credit balance and the price for a **+100 AI Credits** pack.
   - **Promo / Coupon Code**: If you have a promo code, enter it in the **Promo Code** box before clicking checkout.
   - Click **\`Proceed to Stripe Checkout\`** to complete payment securely via Stripe. Upon return, your +100 credits are added automatically and all your open assignment tabs are preserved.

---

## 8. Troubleshooting & Known Google Classroom API Limitations

### Why don't rubric edits sync back into Google Classroom's native rubric UI?
- Google Classroom's API blocks third-party apps from creating or modifying rubrics (\`403 @UserIneligibleToModifyRubrics\`) unless the school domain pays for a *Google Workspace for Education Plus* or *Teaching & Learning Upgrade* license, and Google Classroom makes per-criterion rubric grades strictly read-only via API.
- **How Classroom Agent solves this**: Classroom Agent automatically **imports** any existing rubric from Google Classroom when you open an assignment, and stores all new or edited rubrics and per-criterion breakdowns in Classroom Agent's cloud sidecar while syncing the total numerical \`draftGrade\` / \`assignedGrade\` and the formatted **Feedback Google Doc** directly to the student's Google Classroom submission.

### How do students see their detailed written feedback and rubric breakdown?
- When you click **\`Approve\`** on an evaluation in chat, Classroom Agent creates a clean, formatted **Google Doc** titled \`Feedback - <Assignment> - <Student Name>\` containing your written feedback and attaches it directly to the student's submission in Google Classroom. Both you and the student can open this Google Doc directly in Classroom (and you can view it inside the Submission Preview Canvas tab in Zone B).

### What if I see an "Invalid Credentials" or "401 Unauthorized" error when loading or syncing?
- Google OAuth access tokens expire roughly every 55–60 minutes. If your Google Classroom session expires, Classroom Agent automatically clears the expired token and prompts you to click **\`Sign in with Google Classroom\`** to refresh your Google OAuth session without losing any of your open tabs, rubrics, or staged evaluations.
`;
