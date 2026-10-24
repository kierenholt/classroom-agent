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

Google Cloud Console groups your 5 scopes into two sections:

- **Non-Sensitive Scopes** *(No justification box required)*:
  1. `https://www.googleapis.com/auth/classroom.courses.readonly`
  2. `https://www.googleapis.com/auth/classroom.rosters.readonly`
  3. `https://www.googleapis.com/auth/classroom.coursework.students`
  4. `https://www.googleapis.com/auth/drive.file`
- **Restricted Scopes** *(Requires justification below)*:
  5. `https://www.googleapis.com/auth/drive.readonly`

---

## 3. Copy-Paste Scope Justifications (`Google Auth Platform > Data Access`)

Each justification box has a **1,000-character limit** and must explain: (1) why you need that specific scope, (2) how you use it, and (3) why more limited scopes aren't sufficient.

### Restricted Scopes (`.../auth/drive.readonly`) — "How will the scopes be used?" *(812 / 1,000 characters)*

```text
Classroom Agent requires https://www.googleapis.com/auth/drive.readonly so teachers can view and grade student-submitted coursework files stored in Google Drive:

1) Submission Preview & Cloning: Calls drive.files.get and drive.files.export to render student-submitted Google Docs, Slides, Sheets, PDFs, images, and code files inside the teacher's grading canvas, and copies student submission files when cloning assignments.
2) Rubric Evaluation: Extracts text from student submission files when the teacher clicks "Grade Selected" to draft rubric-aligned feedback.

Why narrower scopes (drive.file / Google Picker) aren't sufficient: Student coursework files are uploaded by students in Google Classroom, not created by our app, so drive.file fails with 403 Insufficient Permission, and batch-grading 30+ students cannot use a manual file picker per student.
```

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
   - **Roster (`classroom.rosters.readonly`)**: Point the cursor at the left-hand **Student Roster (Zone A)** showing student names and Turn-In statuses.
   - **Drive Read (`drive.readonly`)**: Click on a student with a turned-in submission to show their Google Doc / PDF rendering live inside the **Submission Preview Canvas (Zone B)** and the Rubric pane at the bottom.
   - **AI Grading + Feedback Doc Creation (`drive.file`) + Grade Write-Back (`classroom.coursework.students`)**:
     - Click **Grade Selected** in the right-hand AI Co-Pilot pane.
     - Once the evaluation finishes streaming, click **Preview** on the generated feedback card, show the editable feedback modal, and click **Approve** (or click **Return / Publish** in the roster bar) to demonstrate creating the feedback Google Doc (`drive.file`) and syncing the grade back to Google Classroom (`classroom.coursework.students`).

---

## 5. Restricted Scope (`drive.readonly`) — CASA Tier 2 Security Assessment

Because `https://www.googleapis.com/auth/drive.readonly` is a **Restricted Scope**:
1. Once Google approves your initial Brand & Scope Verification (usually within 3–5 business days), Google's Trust & Safety team will send you an email inviting you to complete the **CASA (Cloud Application Security Assessment) Tier 2** verification.
2. For single-developer / small web applications, CASA Tier 2 allows a **free self-assessment scan** using the open-source fluidattacks / OWASP ZAP container against your Cloud Functions + Firebase Hosting deployment, followed by submitting the generated scan report in the CASA portal.
