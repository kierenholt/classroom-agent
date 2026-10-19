# Google OAuth Verification & CASA Tier 2 Submission Guide

This document contains everything required to submit **Classroom Agent** (`classroom-agent-511917`) for Google OAuth Brand & Scope Verification in the [Google Cloud Console — Google Auth Platform](https://console.cloud.google.com/auth/overview?project=classroom-agent-511917).

---

## 1. Branding & Links Configuration (`Google Auth Platform > Branding`)

Fill in the **Branding** page in the Google Cloud Console with these exact values:

| Field | Value |
| :--- | :--- |
| **App Name** | `Classroom Agent` |
| **User Support Email** | `kierenholt@gmail.com` |
| **App Logo (`120x120 px` PNG)** | Upload [`public/oauth-logo-120x120.png`](file:///home/kieren/Documents/code/classroom-agent/public/oauth-logo-120x120.png) |
| **Application Home Page** | `https://classroomagent.co.uk` |
| **Application Privacy Policy Link** | `https://classroomagent.co.uk/privacy` |
| **Application Terms of Service Link** | `https://classroomagent.co.uk/terms` |
| **Authorized Domains** | `classroomagent.co.uk`, `classroom-agent-511917.web.app`, and `classroom-agent-511917.firebaseapp.com` |
| **Developer Contact Information** | `kierenholt@gmail.com` |

> **Pre-Submission Check**:
> 1. Make sure `classroomagent.co.uk` is verified in [Google Search Console](https://search.google.com/search-console) under the same Google account (`kierenholt@gmail.com`)—Google OAuth Verification requires Search Console ownership verification for all custom Authorized Domains.
> 2. Deploy the latest frontend build (`Publish: Deploy Frontend Hosting`) *before* clicking **Submit for Verification** so Google's automated crawler can verify the homepage, `/privacy`, and `/terms` links live at `https://classroomagent.co.uk`.

---

## 2. Exact OAuth Scopes (`Google Auth Platform > Data Access`)

Ensure only the following **6 scopes** (plus standard `openid`, `email`, `profile`) are listed in your Data Access configuration (`classroom.student-submissions.students.readonly` has been removed because `classroom.coursework.students` is a superset):

1. `https://www.googleapis.com/auth/classroom.courses.readonly` *(Sensitive)*
2. `https://www.googleapis.com/auth/classroom.rosters.readonly` *(Sensitive)*
3. `https://www.googleapis.com/auth/classroom.profile.photos` *(Sensitive)*
4. `https://www.googleapis.com/auth/classroom.coursework.students` *(Sensitive)*
5. `https://www.googleapis.com/auth/drive.file` *(Non-Sensitive)*
6. `https://www.googleapis.com/auth/drive.readonly` *(Restricted)*

---

## 3. Copy-Paste Scope Justifications (`Verification Center`)

Copy and paste the text below into the corresponding justification fields in the Google Cloud Console OAuth Verification form:

### Overall Justification: How does your application use the requested Google API scopes?
> Classroom Agent (https://classroomagent.co.uk) is a web-based AI grading and feedback workstation built exclusively for Google Classroom educators. Teachers sign in with their Google Classroom account to open an interactive 70/30 grading workspace. All 6 requested scopes are required immediately upon sign-in because the application preloads the teacher's active Google Classroom courses and coursework assignments on login, displays the class student roster with profile avatars, renders student-submitted Google Drive files (Google Docs, Slides, Sheets, PDFs, images, and code files) inside the grading preview canvas, and writes teacher-approved grades and formatted Google Doc feedback documents back to the student's Google Classroom submission.

### Why isn't a narrower scope sufficient? (General / `drive.readonly` explanation)
> Classroom Agent must read and render student-submitted coursework attachments stored in Google Drive (e.g., essays in Google Docs, slide decks, and PDFs turned in by students via Google Classroom). Because these student files were created and uploaded by students inside Google Classroom—rather than created by the Classroom Agent app itself or opened via a standalone Google Drive file picker—the narrower `drive.file` scope cannot read or export student submission attachments (`403 Insufficient Permission`). Therefore, `https://www.googleapis.com/auth/drive.readonly` is strictly required to preview student submissions in the workspace canvas and extract text when the teacher requests an AI rubric evaluation. For creating new feedback documents, we strictly use `https://www.googleapis.com/auth/drive.file`.

### Per-Scope Justifications

- **`https://www.googleapis.com/auth/classroom.courses.readonly`**
  > Used to call `courses.list(teacherId: 'me', courseStates: ['ACTIVE'])` and `courses.get` so the authenticated teacher can view and select their active Google Classroom courses in the Assignment Picker modal.

- **`https://www.googleapis.com/auth/classroom.rosters.readonly`**
  > Used to call `courses.students.list` so the teacher's grading workspace (Zone A Student Roster) displays the enrolled students' names and maps each student to their coursework submission status.

- **`https://www.googleapis.com/auth/classroom.profile.photos`**
  > Used to read `userProfile.photoUrl` from the course roster response so student profile avatars are displayed next to student names in the grading roster for quick visual identification by the teacher.

- **`https://www.googleapis.com/auth/classroom.coursework.students`**
  > Used to list and read coursework assignments and rubrics (`courses.courseWork.list`, `courses.courseWork.get`, `courses.courseWork.rubrics.list`), create new coursework assignments (`courses.courseWork.create`), list student submissions (`courses.courseWork.studentSubmissions.list`), attach teacher-approved feedback Google Docs (`courses.courseWork.studentSubmissions.modifyAttachments`), patch numerical grades (`draftGrade` and `assignedGrade` via `studentSubmissions.patch`), and return graded work to students (`studentSubmissions.return`).

- **`https://www.googleapis.com/auth/drive.readonly`**
  > Used to call `drive.files.get` and `drive.files.export` to render student-submitted Google Docs, Slides, Sheets, PDFs, and images inside the teacher's Submission Preview Canvas (Zone B), and to extract the text content of a student's submitted file when the teacher explicitly clicks "Grade Selected" to evaluate the submission against the assignment rubric.

- **`https://www.googleapis.com/auth/drive.file`**
  > Used to create formatted Google Doc feedback reports (`drive.files.create`) containing the teacher-approved rubric breakdown, comments, and next steps, which are then attached to the student's Google Classroom submission.

---

## 4. YouTube Demo Video Script (90 Seconds)

Google requires an **unlisted YouTube video** demonstrating the complete OAuth grant process and every requested scope in action. Follow this checklist while recording your screen:

1. **Start on the Public Homepage (`https://classroomagent.co.uk`)**:
   - Show the URL bar clearly.
   - Scroll briefly to show the **Features**, **How Classroom Agent Uses & Protects Your Google Data**, and click/hover the **Privacy Policy** (`/privacy`) and **Terms of Service** (`/terms`) links.
2. **Trigger the OAuth Consent Screen (Crucial Requirements!)**:
   - Click the **"Sign in with Google Classroom"** button.
   - When the Google Sign-In / OAuth Consent popup window opens:
     - Make sure the OAuth popup's **full URL bar is visible** (Google reviewers check that `client_id=...` is visible in the address bar of the popup).
     - Ensure your Google account language is set to **English**.
     - Slowly scroll down the consent screen showing the app name (`Classroom Agent`), logo, and all requested Classroom and Drive permissions, then click **Continue / Allow**.
3. **Demonstrate Every Scope in the App**:
   - **Courses (`classroom.courses.readonly`) & Coursework (`classroom.coursework.students`)**: Click `+ Assignment` in the top tab bar to open the Assignment Picker modal, select a course, and select an assignment (or create a new assignment).
   - **Roster & Photos (`classroom.rosters.readonly` + `classroom.profile.photos`)**: Point the cursor at the left-hand **Student Roster (Zone A)** showing student names, profile avatars, and Turn-In statuses.
   - **Drive Read (`drive.readonly`)**: Click on a student with a turned-in submission to show their Google Doc / PDF rendering live inside the **Submission Preview Canvas (Zone B)** and the Rubric pane at the bottom.
   - **AI Grading + Feedback Doc Creation (`drive.file`) + Grade Write-Back (`classroom.coursework.students`)**:
     - Click **Grade Selected** in the right-hand AI Co-Pilot pane.
     - Once the evaluation finishes streaming, click **Preview** on the generated feedback card, show the editable feedback modal, and click **Approve** (or click **Return / Publish** in the roster bar) to demonstrate creating the feedback Google Doc (`drive.file`) and syncing the grade back to Google Classroom (`classroom.coursework.students`).

---

## 5. Restricted Scope (`drive.readonly`) — CASA Tier 2 Security Assessment

Because `https://www.googleapis.com/auth/drive.readonly` is a **Restricted Scope**:
1. Once Google approves your initial Brand & Scope Verification (usually within 3–5 business days), Google's Trust & Safety team will send you an email inviting you to complete the **CASA (Cloud Application Security Assessment) Tier 2** verification.
2. For single-developer / small web applications, CASA Tier 2 allows a **free self-assessment scan** using the open-source fluidattacks / OWASP ZAP container against your Cloud Functions + Firebase Hosting deployment, followed by submitting the generated scan report in the CASA portal.
