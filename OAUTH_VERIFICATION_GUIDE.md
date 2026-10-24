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

Classroom Agent requests strictly **4 Non-Sensitive Scopes** (zero Sensitive or Restricted scopes, so no CASA Tier 2 assessment is required):

1. `https://www.googleapis.com/auth/classroom.courses.readonly`
2. `https://www.googleapis.com/auth/classroom.rosters.readonly`
3. `https://www.googleapis.com/auth/classroom.coursework.students`
4. `https://www.googleapis.com/auth/drive.file`

---

## 3. YouTube Demo Video Script (90 Seconds)

If Google requests a demo video showing the OAuth grant process and the requested scopes in action, follow this checklist while recording your screen:

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
   - **AI Grading + Feedback Doc Creation (`drive.file`) + Grade Write-Back (`classroom.coursework.students`)**:
     - Click **Grade Selected** in the right-hand AI Co-Pilot pane.
     - Once the evaluation finishes streaming, click **Preview** on the generated feedback card, show the editable feedback modal, and click **Approve** (or click **Return / Publish** in the roster bar) to demonstrate creating the feedback Google Doc (`drive.file`) and syncing the grade back to Google Classroom (`classroom.coursework.students`).

