# Classroom Agent — System Architecture & GCP/Firebase Setup

## 1. High-Level System Topology

```mermaid
flowchart TB
    subgraph Client["Frontend SPA (React + Vite + Tailwind)"]
        TabBar["Top Tab Bar (+ New Assignment Tab)"]
        subgraph Pane70["70% Left Pane: Assignment Workspace (per-tab CSS hidden/flex)"]
            ZoneA["Zone A: Student Roster (22%)"]
            ZoneB["Zone B: Multi-Format Submission Preview (48%)"]
            ZoneC["Zone C: Rubric Breakdown & Comments (30%)"]
        end
        subgraph Pane30["30% Right Pane: Agent Co-Pilot (per-tab CSS hidden/flex)"]
            ChatPanel["ChatPanel.tsx (Dual-State Sync)"]
            ToolBadge["ToolCallBadge.tsx (Live Accordions)"]
        end
    end

    subgraph Firebase["Firebase & GCP Backend (classroom-agent-511917)"]
        Auth["Firebase Auth (Google OAuth + Classroom/Drive Scopes)"]
        Firestore[("Cloud Firestore Sidecar\nassignments (rubric) / evaluations / messages")]
        Storage[("Cloud Storage\nUploaded Rubrics & Mark Schemes")]
        subgraph Functions["Cloud Functions (\\functions - Express + TypeScript)"]
            SSE["POST /api/chat (SSE Stream)"]
            ClassroomAPI["/api/classroom/* (Live Workspace, Preview, Grade, Return)"]
            AgentLoop["Gemini 2.5/3 Flash Loop\n(Preserves thought_signature)"]
        end
    end

    subgraph External["Google Workspace & AI APIs"]
        GClassroom["Google Classroom API v1 (Live Source of Truth)"]
        GDrive["Google Drive API v3"]
        Gemini["Google GenAI API (@google/genai)"]
    end

    Client -->|Sign-In + OAuth Scopes| Auth
    ZoneA & ZoneC & ChatPanel <-->|Real-time onSnapshot (Sidecar)| Firestore
    ChatPanel -->|Upload Rubric File| Storage
    ChatPanel -->|POST /api/chat + Bearer & OAuth Token| SSE
    ZoneA & ZoneB & ZoneC -->|Live REST Reads & Grade Write-Back| ClassroomAPI
    SSE --> AgentLoop
    AgentLoop <-->|Function Calling| Gemini
    AgentLoop -->|Live Reads & Grade Write-Back| GClassroom & GDrive
    AgentLoop -->|Write Rubric & Evaluations Sidecar| Firestore
    ClassroomAPI <--> GClassroom & GDrive & Firestore
```

---

## 2. Repository & Directory Structure

```text
classroom-agent/
├── .env.example                  # Template documenting all required env vars & ports
├── .env.local                    # Local development & Firebase Emulator configuration
├── .env.production               # Production GCP / Firebase endpoints configuration
├── firebase.json                 # Firestore, Functions, Storage & Emulator port definitions
├── .firebaserc                   # Binds workspace to GCP project `classroom-agent-511917`
├── firestore.rules               # Teacher-scoped Firestore security rules
├── storage.rules                 # Teacher-scoped Storage security rules
├── PRD.md                        # Product Requirements Document
├── architecture.md               # System Architecture & GCP Setup Guide
├── GEMINI.md                     # Architecture & project reference
├── agent_pane_design_plan.md     # 30% Agent Pane reference blueprint
├── src/                          # Frontend React + Vite + TypeScript SPA
│   ├── config/
│   │   ├── env.ts                # Fail-fast env validator (throws if any VITE_* var is missing)
│   │   └── firebase.ts           # Firebase Auth, Firestore, Storage initialization
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopTabBar.tsx     # Open assignment tabs + "+ New Assignment Tab" button
│   │   │   └── WorkspaceLayout.tsx # 70/30 split with CSS `hidden` tab persistence
│   │   ├── workspace/
│   │   │   ├── AssignmentPickerView.tsx  # Browse Classroom courses & coursework
│   │   │   ├── StudentRosterZone.tsx     # Zone A (22%): filterable student list & bulk return
│   │   │   ├── SubmissionPreviewZone.tsx # Zone B (48%): Docs/Slides/PDF/Code/Image/Link preview
│   │   │   └── RubricMarkingZone.tsx     # Zone C (30%): rubric criteria, total score & comments
│   │   └── agent/
│   │       ├── ChatPanel.tsx     # 30% persistent streaming co-pilot pane
│   │       ├── ToolCallBadge.tsx # Collapsible tool telemetry badge
│   │       └── api.ts            # Chunk-resilient SSE stream consumer
│   └── types/
│       └── classroom.ts          # Shared TypeScript interfaces matching Firestore schema
├── functions/                    # Firebase Cloud Functions backend (`npm run build` after edits)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # Express app exported as Cloud Function `api`
│       ├── config/env.ts         # Fail-fast server env validator
│       ├── middleware/auth.ts    # Verifies Firebase ID token & extracts Google OAuth token
│       ├── routes/
│       │   ├── classroom.ts      # Course list, coursework sync, Drive export, manual grade/return
│       │   └── chat.ts           # POST /api/chat SSE loop with thought_signature preservation
│       ├── services/
│       │   ├── classroomClient.ts # Google Classroom v1 & Drive v3 SDK wrappers
│       │   └── driveExtractor.ts  # Exports Docs/Slides/Sheets/PDF/Code for preview & Gemini
│       └── tools/
│           └── gradingTools.ts   # Tool declarations & executors (evaluate_and_grade_submission, etc.)
├── scripts/
│   └── run_tests.js              # Sequential test runner (`node scripts/run_tests.js <name> local 1`)
├── TESTING.md                    # E2E & Live Google Classroom test setup & OAuth refresh token guide
└── tests/
    ├── helpers/
    │   ├── testSeeder.ts         # Local Firestore Emulator fixture seeder & teardown
    │   └── classroomSandboxSeeder.ts # Live Google Classroom Teacher + Student fixture seeder & teardown
    └── e2e/                      # Playwright E2E tests (`methodname_initialstate_expectedbehaviour_test`)
```

---

## 3. Authentication & Token Forwarding Flow

1. **Teacher Sign-In (Frontend)**:
   - Uses Firebase Auth `GoogleAuthProvider` configured with the 6 required scopes:
     - `https://www.googleapis.com/auth/classroom.courses.readonly`
     - `https://www.googleapis.com/auth/classroom.coursework.students`
     - `https://www.googleapis.com/auth/classroom.rosters.readonly`
     - `https://www.googleapis.com/auth/classroom.student-submissions.students.readonly`
     - `https://www.googleapis.com/auth/drive.readonly`
     - `https://www.googleapis.com/auth/drive.file`
   - Upon sign-in, the frontend extracts the Google OAuth `accessToken` from `GoogleAuthProvider.credentialFromResult(result)` and maintains it alongside the Firebase Auth user session.
2. **Authenticated API & SSE Calls**:
   - Every request to `/api/*` and `/api/chat` sends:
     - `Authorization: Bearer <firebaseIdToken>`
     - `X-Google-Access-Token: <googleOAuthAccessToken>`
   - **Fail-Fast Validation**: The backend middleware rejects any request missing either token with `401 Unauthorized` immediately.
3. **Live Google Classroom Reads + Firestore Sidecar Architecture (Option 2)**:
   - **Google Classroom API (Live Source of Truth)**: Courses, coursework metadata, student rosters, submission turn-in states, Drive attachments, existing Classroom rubrics (`GET /v1/courses/{courseId}/courseWork/{courseWorkId}/rubrics`), and grades (`draftGrade`, `assignedGrade`) are always fetched live from Google Classroom (`GET /api/classroom/courses/:courseId/coursework/:courseWorkId/workspace`) — zero duplicate roster or attachment copies are stored in Firestore.
   - **Cloud Firestore (AI Sidecar Only)**: Stores strictly what the Google Classroom API does not support natively or blocks via licensing/API restrictions, keyed by `{courseId}_{courseWorkId}`:
     - `assignments/{assignmentId}` $\rightarrow$ `{ rubric, updatedAt }` (seeded from Classroom's `courses.courseWork.rubrics` GET endpoint on workspace load if a Classroom rubric is present and no Firestore rubric exists yet)
     - `assignments/{assignmentId}/evaluations/{studentId}` $\rightarrow$ `{ studentId, submissionId, rubricBreakdown, overallFeedback, comments, draftGrade, assignedGrade, classroomSyncStatus, updatedAt }`
     - `assignments/{assignmentId}/messages/{messageId}` $\rightarrow$ Agent Co-Pilot chat history and `toolCalls` audit trail.
   - When the agent executes `set_assignment_rubric`, `evaluate_and_grade_submission`, or `return_student_submissions`, it patches grades directly to Google Classroom API **and** updates the Firestore sidecar (`assignments/{assignmentId}` and `evaluations/{studentId}`), which triggers the frontend's `onSnapshot` listeners in `<100ms` to merge live Classroom data with real-time AI evaluations.
   - **Documented API Blockers Preventing Removal of the Firestore Sidecar**:
     1. **`courses.courseWork.rubrics` Write Blocker (`403 @UserIneligibleToModifyRubrics`)**: Creating or patching rubrics via the Google Classroom API requires the teacher account to have a paid **Google Workspace for Education Plus** or **Teaching & Learning Upgrade** license. Unlicensed or standard Workspace accounts receive `403 PERMISSION_DENIED: @UserIneligibleToModifyRubrics` on `POST`/`PATCH`, though `GET .../rubrics` succeeds (`200 OK`). Therefore, Classroom rubrics are only read from Classroom into Firestore, and rubric writes remain in Firestore.
     2. **`draftRubricGrades` / `assignedRubricGrades` Read-Only Limitation**: Per-criterion rubric scores on `StudentSubmission` are read-only in the Google Classroom v1 API; only overall `draftGrade` and `assignedGrade` can be patched.
     3. **Drive Comments Write Scope Blocker (`403 PERMISSION_DENIED`)**: Writing comments (`drive.comments.create`) onto student-submitted Drive attachments fails under `drive.file` + `drive.readonly` scopes because the file was created by the student rather than the teacher's app session.

---

## 4. GCP & Firebase Project Setup (`classroom-agent-511917`)

### 4.1 Provisioned Firebase Resources
- **Project Display Name**: `classroom-agent`
- **Project ID**: `classroom-agent-511917`
- **Project Number**: `82833838117`
- **Firebase Web App**: `classroom-agent-web` (`1:82833838117:web:6646420fa24876a1112fcc`)
- **Cloud Firestore**: `(default)` Native database in `europe-west2` with real-time updates enabled
- **Firebase Auth**: Google Sign-In provider enabled (`Classroom Agent`)
- **Local Emulator Ports**:
  - Auth: `9099`
  - Functions: `5001`
  - Firestore: `8080`
  - Storage: `9199`
  - Emulator UI: `4000`

### 4.2 Manual Google Cloud Console Checklist
1. **Enable Google Workspace APIs**:
   - Enable **[Google Classroom API](https://console.cloud.google.com/apis/library/classroom.googleapis.com?project=classroom-agent-511917)**
   - Enable **[Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com?project=classroom-agent-511917)**
2. **Configure OAuth Consent Screen & Scopes**:
   - In **[OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent?project=classroom-agent-511917)**:
     - Add your teacher and student test Google accounts under **Test users**.
     - Add the 6 Classroom and Drive scopes listed in Section 3.
   - In **[Credentials](https://console.cloud.google.com/apis/credentials?project=classroom-agent-511917)**:
     - Ensure `http://localhost:5173` is listed under **Authorized JavaScript origins** and `http://localhost:5173/__/auth/handler` is in **Authorized redirect URIs** on the Web client OAuth 2.0 Client ID.
3. **Configure Gemini API Key**:
   - Set `GEMINI_API_KEY` in [.env.local](file:///home/kieren/Documents/code/classroom-agent/.env.local) and [.env.production](file:///home/kieren/Documents/code/classroom-agent/.env.production).
