# Classroom Agent — E2E & Live Google Classroom Testing Guide

This document details the E2E testing architecture, credential configuration, and the automated **Create $\rightarrow$ Submit $\rightarrow$ Grade $\rightarrow$ Return $\rightarrow$ Teardown** lifecycle for Google Classroom and Firebase.

---

## 1. Core Testing Rules & Conventions

1. **Sequential Execution**:
   All Playwright E2E tests are executed one at a time (sequentially, `workers = 1`) via [scripts/run_tests.js](file:///home/kieren/Documents/code/classroom-agent/scripts/run_tests.js):
   ```bash
   node scripts/run_tests.js <test-name-or-file> local 1
   ```
2. **Test Naming Convention**:
   Every test must follow:
   ```text
   methodname_initialstate_expectedbehaviour_test()
   ```
3. **Zero Mock Data in Production**:
   - No mock data, dummy accounts (`@example.com`), or silent default fallbacks exist anywhere in production code (`src/` or `functions/src/`).
   - All test fixtures are created dynamically during `test.beforeEach()` and torn down completely in `test.afterEach()`.
4. **Zero Hardcoded Secrets**:
   - All OAuth Client IDs, Client Secrets, Refresh Tokens, Course IDs, and API keys are stored strictly in [.env.local](file:///home/kieren/Documents/code/classroom-agent/.env.local) (never committed or hardcoded in source files).
5. **Selectors**:
   - Assert UI elements using explicit `data-testid` attributes defined in [PRD.md Section 9.1](file:///home/kieren/Documents/code/classroom-agent/PRD.md#L363-L374).

---

## 2. Two-Tier E2E Testing Architecture

### Tier 1: Local Firebase Emulator Suite
- **Helper**: [tests/helpers/testSeeder.ts](file:///home/kieren/Documents/code/classroom-agent/tests/helpers/testSeeder.ts)
- **Spec**: [tests/e2e/workspace_layout_and_agent_copilot_test.spec.ts](file:///home/kieren/Documents/code/classroom-agent/tests/e2e/workspace_layout_and_agent_copilot_test.spec.ts)
- **Lifecycle**:
  - `beforeEach`: Seeds `assignments/{assignmentId}` and `submissions/{studentId}` directly into the local Firestore Emulator (`127.0.0.1:8080`).
  - `afterEach`: Deletes all seeded documents from the Firestore Emulator.

### Tier 2: Live Google Classroom & Drive Sandbox Suite
- **Helper**: [tests/helpers/classroomSandboxSeeder.ts](file:///home/kieren/Documents/code/classroom-agent/tests/helpers/classroomSandboxSeeder.ts)
- **Spec**: [tests/e2e/live_classroom_assignment_lifecycle_test.spec.ts](file:///home/kieren/Documents/code/classroom-agent/tests/e2e/live_classroom_assignment_lifecycle_test.spec.ts)
- **Lifecycle**:
  ```mermaid
  sequenceDiagram
      autonumber
      participant Test as Playwright Test Runner
      participant OAuth as Google OAuth2 Token API
      participant GC as Google Classroom API v1
      participant Drive as Google Drive API v3

      Note over Test,Drive: test.beforeEach() — Setup
      Test->>OAuth: Exchange Teacher & Student Refresh Tokens for Access Tokens
      Test->>GC: GET /v1/courses/{courseId} (Teacher fetches enrollmentCode)
      Test->>GC: POST /v1/courses/{courseId}/students (Student joins course via enrollmentCode)
      Test->>GC: POST /v1/courses/{courseId}/courseWork (Teacher creates assignment)
      Test->>GC: GET .../studentSubmissions?userId=me (Student locates submissionId)
      Test->>Drive: POST /upload/drive/v3/files (Student uploads sample code/doc file)
      Test->>GC: POST .../studentSubmissions/{id}:modifyAttachments (Student attaches Drive file)
      Test->>GC: POST .../studentSubmissions/{id}:turnIn (Student turns in assignment)

      Note over Test,Drive: Test Execution
      Test->>Test: Run UI / API assertions against live assignment & submission

      Note over Test,Drive: test.afterEach() — Teardown
      Test->>GC: DELETE /v1/courses/{courseId}/courseWork/{courseWorkId} (Teacher deletes coursework)
      Test->>Drive: DELETE /drive/v3/files/{driveFileId} (Student deletes temporary Drive file)
  ```

---

## 3. Environment Variables for Live Classroom Tests (`.env.local`)

All live test credentials are read dynamically by [tests/helpers/classroomSandboxSeeder.ts](file:///home/kieren/Documents/code/classroom-agent/tests/helpers/classroomSandboxSeeder.ts) with fail-fast validation:

```bash
# --- Live Google Classroom Test Sandbox Configuration ---
TEST_CLASSROOM_COURSE_ID=<numeric_classroom_course_id>
TEST_GOOGLE_CLIENT_ID=<web_oauth_client_id>
TEST_GOOGLE_CLIENT_SECRET=<web_oauth_client_secret>
TEST_TEACHER_REFRESH_TOKEN=<teacher_oauth_refresh_token>
TEST_STUDENT_EMAIL=<student_google_account_email>
TEST_STUDENT_REFRESH_TOKEN=<student_oauth_refresh_token>
```

> [!TIP]
> **Decoding Base64 Course URLs**:
> A Google Classroom web URL like `https://classroom.google.com/c/ODgyOTU4ODQ5ODQz` encodes the numeric `courseId` in Base64 (`Buffer.from('ODgyOTU4ODQ5ODQz', 'base64').toString('ascii')` $\rightarrow$ `882958849843`). Always store the decoded numeric ID in `TEST_CLASSROOM_COURSE_ID`.

---

## 4. One-Time OAuth 2.0 Refresh Token Setup Guide

If you ever need to regenerate `TEST_TEACHER_REFRESH_TOKEN` or `TEST_STUDENT_REFRESH_TOKEN`:

### Prerequisite Checklist in Google Cloud Console
1. **Authorized Redirect URI**:
   In **[Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials?project=classroom-agent-511917)**, ensure your Web OAuth 2.0 Client ID includes:
   - `https://developers.google.com/oauthplayground`
2. **Test Users**:
   In **[Google Cloud Console — OAuth Audience](https://console.cloud.google.com/auth/audience?project=classroom-agent-511917)**, ensure both the **Teacher** and **Student** Google accounts are listed under **Test users**.

### Generating the Teacher Refresh Token
1. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Click the **Gear icon (⚙️)** (top right) $\rightarrow$ check **"Use your own OAuth credentials"** $\rightarrow$ enter `TEST_GOOGLE_CLIENT_ID` and `TEST_GOOGLE_CLIENT_SECRET`.
3. In **Step 1**, paste the 6 Teacher scopes:
   ```text
   https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.students https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.student-submissions.students.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file
   ```
4. Click **Authorize APIs**, sign in with the **Teacher** Google account, and approve.
5. In **Step 2**, click **Exchange authorization code for tokens** and copy `refresh_token` into `TEST_TEACHER_REFRESH_TOKEN` in [.env.local](file:///home/kieren/Documents/code/classroom-agent/.env.local).

### Generating the Student Refresh Token
1. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground) in an Incognito window.
2. Click the **Gear icon (⚙️)** $\rightarrow$ check **"Use your own OAuth credentials"** $\rightarrow$ enter `TEST_GOOGLE_CLIENT_ID` and `TEST_GOOGLE_CLIENT_SECRET`.
3. In **Step 1**, paste the 4 Student scopes:
   ```text
   https://www.googleapis.com/auth/classroom.courses https://www.googleapis.com/auth/classroom.rosters https://www.googleapis.com/auth/classroom.coursework.me https://www.googleapis.com/auth/drive.file
   ```
4. Click **Authorize APIs**, sign in with the **Student** Google account, and approve.
5. In **Step 2**, click **Exchange authorization code for tokens** and copy `refresh_token` into `TEST_STUDENT_REFRESH_TOKEN` in [.env.local](file:///home/kieren/Documents/code/classroom-agent/.env.local).
