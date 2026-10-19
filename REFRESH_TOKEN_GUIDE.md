# How to Generate OAuth 2.0 Refresh Tokens for E2E Tests

Follow these steps in **[Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground)** whenever `TEST_TEACHER_REFRESH_TOKEN` or `TEST_STUDENT_REFRESH_TOKEN` in [`.env.local`](file:///home/kieren/Documents/code/classroom-agent/.env.local) expires.

---

## 1. Teacher Refresh Token (`TEST_TEACHER_REFRESH_TOKEN`)

1. Open **[https://developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)**.
2. Click the **Gear icon (⚙️)** in the top-right corner:
   - Check **"Use your own OAuth credentials"**
   - Copy **OAuth Client ID** (`TEST_GOOGLE_CLIENT_ID`) from [`.env.local`](file:///home/kieren/Documents/code/classroom-agent/.env.local#L34)
   - Copy **OAuth Client secret** (`TEST_GOOGLE_CLIENT_SECRET`) from [`.env.local`](file:///home/kieren/Documents/code/classroom-agent/.env.local#L35)
   - Click **Close**.
3. In **Step 1 (Select & authorize APIs)** on the left, paste the following 6 Teacher scopes into the *"Input your own scopes"* box:
   ```text
   https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.students https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.student-submissions.students.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file
   ```
4. Click **Authorize APIs**, sign in with your **Teacher** Google account, and click **Continue**.
5. In **Step 2 (Exchange authorization code for tokens)**, click **Exchange authorization code for tokens**.
6. Copy the `refresh_token` and paste it into `TEST_TEACHER_REFRESH_TOKEN` in [`.env.local`](file:///home/kieren/Documents/code/classroom-agent/.env.local#L36).

---

## 2. Student Refresh Token (`TEST_STUDENT_REFRESH_TOKEN`)

1. Open **[https://developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)** in an **Incognito** window.
2. Click the **Gear icon (⚙️)** in the top-right corner:
   - Check **"Use your own OAuth credentials"**
   - Paste `TEST_GOOGLE_CLIENT_ID` and `TEST_GOOGLE_CLIENT_SECRET` from [`.env.local`](file:///home/kieren/Documents/code/classroom-agent/.env.local#L34-L35)
   - Click **Close**.
3. In **Step 1 (Select & authorize APIs)**, paste the following 4 Student scopes into the *"Input your own scopes"* box:
   ```text
   https://www.googleapis.com/auth/classroom.courses https://www.googleapis.com/auth/classroom.rosters https://www.googleapis.com/auth/classroom.coursework.me https://www.googleapis.com/auth/drive.file
   ```
4. Click **Authorize APIs**, sign in with your **Student** Google account (`TEST_STUDENT_EMAIL` in [`.env.local`](file:///home/kieren/Documents/code/classroom-agent/.env.local#L37)), and click **Continue**.
5. In **Step 2 (Exchange authorization code for tokens)**, click **Exchange authorization code for tokens**.
6. Copy the `refresh_token` and paste it into `TEST_STUDENT_REFRESH_TOKEN` in [`.env.local`](file:///home/kieren/Documents/code/classroom-agent/.env.local#L38).
