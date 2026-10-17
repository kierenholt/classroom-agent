# Classroom Agent — Architecture & Project Reference

## Overview
Classroom Agent is an AI-native grading and feedback workstation for Google Classroom built around a **70% Tabbed Assignment Workspace + 30% Persistent Streaming Agent Co-Pilot Pane** layout and a **Live Google Classroom Reads + Firestore Sidecar** data architecture:
- **Google Classroom API (Live Source of Truth)**: Courses, coursework metadata, student rosters, submission turn-in states, Drive attachments, and grades (`draftGrade`, `assignedGrade`) are read live from Google Classroom (`GET /api/classroom/courses/:courseId/coursework/:courseWorkId/workspace`) with zero duplicate roster or attachment storage in Firestore.
- **Cloud Firestore (AI Sidecar Only)**: Stores strictly what Google Classroom API does not natively provide, keyed by `assignments/{courseId}_{courseWorkId}`:
  - `assignments/{assignmentId}` $\rightarrow$ `{ rubric, updatedAt }`
  - `assignments/{assignmentId}/evaluations/{studentId}` $\rightarrow$ `{ studentId, submissionId, rubricBreakdown, overallFeedback, comments, draftGrade, assignedGrade, classroomSyncStatus, updatedAt }`
  - `assignments/{assignmentId}/messages/{messageId}` $\rightarrow$ Agent Co-Pilot chat history and `toolCalls` audit trail.

## GCP & Firebase Project Configuration
- **Project ID**: `classroom-agent-511917` (Project Number: `82833838117`)
- **Firebase Web App ID**: `1:82833838117:web:6646420fa24876a1112fcc` (`classroom-agent-web`)
- **Cloud Firestore**: `(default)` Native database in `europe-west2` with real-time updates enabled (AI Sidecar for rubrics, evaluations, and agent messages)
- **Authentication**: Firebase Auth with Google Sign-In provider (`Classroom Agent`)

## Key Architecture & Configuration Files
- [PRD.md](file:///home/kieren/Documents/code/classroom-agent/PRD.md): Full Product Requirements Document covering the 70/30 layout, 3-zone assignment workspace (Student Roster, Multi-format Submission Preview Canvas, Rubric Breakdown & Comments Panel), Google Classroom & Drive API direct write-back (`draftGrade` / `assignedGrade` + `return`), Firestore schema, and SSE agent tool loop (`evaluate_and_grade_submission` per student).
- [architecture.md](file:///home/kieren/Documents/code/classroom-agent/architecture.md): System topology, Live Classroom + Firestore Sidecar data flow, directory layout, OAuth/token forwarding flow, and GCP/Firebase setup guide for `classroom-agent-511917`.
- [agent_pane_design_plan.md](file:///home/kieren/Documents/code/classroom-agent/agent_pane_design_plan.md): Reference blueprint for the 30% persistent streaming agent co-pilot pane (`ChatPanel.tsx`, `ToolCallBadge.tsx`, `api.ts` SSE consumer, Gemini `thought_signature` preservation, and CSS `hidden` tab persistence).
- [.firebaserc](file:///home/kieren/Documents/code/classroom-agent/.firebaserc) & [firebase.json](file:///home/kieren/Documents/code/classroom-agent/firebase.json): Binds the workspace to `classroom-agent-511917` and configures Cloud Functions (`\functions`), Firestore (`8080`), Auth (`9099`), Storage (`9199`), Functions (`5001`), and Emulator UI (`4000`).
- [firestore.rules](file:///home/kieren/Documents/code/classroom-agent/firestore.rules) & [storage.rules](file:///home/kieren/Documents/code/classroom-agent/storage.rules): Security rules for `assignments/{assignmentId}`, `evaluations/{studentId}`, `messages/{messageId}`, and `/uploads/**`.
- [.env.example](file:///home/kieren/Documents/code/classroom-agent/.env.example), [.env.local](file:///home/kieren/Documents/code/classroom-agent/.env.local), and [.env.production](file:///home/kieren/Documents/code/classroom-agent/.env.production): Environment configuration files for local emulators vs. production GCP/Firebase endpoints.

## Implemented Architecture & Source Components

### Frontend SPA (`/src`)
- [src/config/env.ts](file:///home/kieren/Documents/code/classroom-agent/src/config/env.ts): Fail-fast client environment validator enforcing all `VITE_*` parameters.
- [src/config/firebase.ts](file:///home/kieren/Documents/code/classroom-agent/src/config/firebase.ts): Firebase Auth, Firestore, and Storage client initialization with emulator fallback and Google OAuth scopes.
- [src/context/AuthContext.tsx](file:///home/kieren/Documents/code/classroom-agent/src/context/AuthContext.tsx): Teacher authentication provider managing Firebase ID tokens and Google OAuth tokens.
- [src/components/layout/TopTabBar.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/layout/TopTabBar.tsx): Multi-tab header supporting persistent assignment tabs and assignment selector.
- [src/components/layout/WorkspaceLayout.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/layout/WorkspaceLayout.tsx): 70/30 split layout managing persistent in-memory DOM mounting via CSS `flex`/`hidden`.
- [src/components/workspace/AssignmentPickerView.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/workspace/AssignmentPickerView.tsx): Course and coursework selector with Classroom sync and clone actions.
- [src/components/workspace/StudentRosterZone.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/workspace/StudentRosterZone.tsx): Zone A (22%) student roster with search, filter pills, and bulk draft return.
- [src/components/workspace/SubmissionPreviewZone.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/workspace/SubmissionPreviewZone.tsx): Zone B (48%) multi-format viewer for Docs, Slides, Sheets, Code, PDF, images, and links.
- [src/components/workspace/RubricMarkingZone.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/workspace/RubricMarkingZone.tsx): Zone C (30%) rubric breakdown, score inputs, sync status, and comments feed.
- [src/components/workspace/AssignmentWorkspace.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/workspace/AssignmentWorkspace.tsx): Container orchestrating Zones A, B, and C by fetching live Classroom roster/submissions (`GET /api/classroom/courses/:courseId/coursework/:courseWorkId/workspace`) and merging them in real time with Firestore Sidecar `onSnapshot` subscriptions (`assignments/{assignmentId}` for `rubric` and `evaluations/{studentId}` for criterion breakdowns and comments).
- [src/components/agent/ChatPanel.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/agent/ChatPanel.tsx): 30% persistent agent co-pilot pane with dual-state Firestore sync and prompt starters.
- [src/components/agent/ToolCallBadge.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/agent/ToolCallBadge.tsx): Collapsible tool telemetry badge with argument and result inspectors.
- [src/components/agent/api.ts](file:///home/kieren/Documents/code/classroom-agent/src/components/agent/api.ts): Chunk-resilient SSE stream consumer with fail-fast auth token verification.

### Cloud Functions Backend (`/functions`)
- [functions/src/config/env.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/config/env.ts): Fail-fast server environment validator enforcing mandatory parameters (`GCP_PROJECT_ID`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.8-flash`).
- [functions/src/middleware/auth.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/middleware/auth.ts): Express middleware verifying Firebase ID token and `X-Google-Access-Token`.
- [functions/src/services/classroomClient.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/services/classroomClient.ts): Google Classroom v1 REST and Drive v3 client wrappers (`fetchLiveWorkspaceFromClassroom`, `parseAssignmentId`, `patchSubmissionGrade`, `returnSubmission`).
- [functions/src/services/driveExtractor.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/services/driveExtractor.ts): Document and submission extractor for Docs, Slides, Sheets, Code, and binary assets.
- [functions/src/tools/gradingTools.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/tools/gradingTools.ts): Gemini tool declarations and executors reading live from Google Classroom and persisting rubrics & evaluations to the Firestore Sidecar (`get_assignment_details`, `set_assignment_rubric`, `list_student_submissions`, `get_student_submission_content`, `evaluate_and_grade_submission`, `return_student_submissions`).
- [functions/src/routes/chat.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/routes/chat.ts): `POST /api/chat` SSE endpoint grounded with live Classroom coursework metadata and Sidecar rubric/history, with `thought_signature` preservation.
- [functions/src/routes/classroom.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/routes/classroom.ts): REST endpoints for live courses, coursework, live workspace (`GET /courses/:courseId/coursework/:courseWorkId/workspace`), clone, drive preview, manual grade, and return.
- [functions/src/routes/upload.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/routes/upload.ts): Multipart upload for rubric attachments to Cloud Storage.
- [functions/src/index.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/index.ts): Express application exported as 2nd Gen Cloud Function `api` deployed to `europe-west2` with both `/` and `/api/` route mounting.

### Developer Environment & Process Launchers
- [.vscode/launch.json](file:///home/kieren/Documents/code/classroom-agent/.vscode/launch.json): VS Code debug and service launch configurations for Frontend (Vite), Backend Emulators (Auth, Firestore, Functions, Storage), Functions TypeScript Watcher, "Launch All Backend (Emulators + Functions Watch)", and full stack compound launcher.
- [.vscode/tasks.json](file:///home/kieren/Documents/code/classroom-agent/.vscode/tasks.json): Build and background process tasks for `npm run dev`, `firebase emulators:start`, and functions compilation.

### Testing & Verification
- [TESTING.md](file:///home/kieren/Documents/code/classroom-agent/TESTING.md): Full E2E & Live Google Classroom testing guide (Teacher & Student OAuth refresh token setup, scopes, and automated create/submit/turn-in/teardown lifecycle).
- [scripts/run_tests.js](file:///home/kieren/Documents/code/classroom-agent/scripts/run_tests.js): Sequential Playwright test runner invoked via `npm test -- <test-name-or-file> local 1`.
- [playwright.config.ts](file:///home/kieren/Documents/code/classroom-agent/playwright.config.ts): Playwright test configuration targeting `http://127.0.0.1:5173`.
- [tests/helpers/testSeeder.ts](file:///home/kieren/Documents/code/classroom-agent/tests/helpers/testSeeder.ts): Emulator fixture seeder and teardown utility (zero mock data in production).
- [tests/helpers/classroomSandboxSeeder.ts](file:///home/kieren/Documents/code/classroom-agent/tests/helpers/classroomSandboxSeeder.ts): Live Google Classroom & Drive API batch fixture seeder (`setupLiveClassroomBatchFixture` & `teardownLiveClassroomBatchFixture`) with in-memory OAuth token caching, fast-path student enrollment memoization, and parallel CourseWork creation + Drive file upload.
- [tests/e2e/workspace_layout_and_agent_copilot_test.spec.ts](file:///home/kieren/Documents/code/classroom-agent/tests/e2e/workspace_layout_and_agent_copilot_test.spec.ts): E2E test suite verifying workspace layout and agent co-pilot against emulator fixtures.
- [tests/e2e/live_classroom_assignment_lifecycle_test.spec.ts](file:///home/kieren/Documents/code/classroom-agent/tests/e2e/live_classroom_assignment_lifecycle_test.spec.ts): E2E test suite using suite-level `test.beforeAll` / `test.afterAll` batch setup/teardown against live Google Classroom & Drive APIs.

## Project Rules
- **Run Tests via NPM Commands**: Always use `npm` commands (`npm test`, `npm run test:e2e`, `npm run test:emulator`, `npm run test:live`) to run tests rather than invoking `node` or `npx playwright` directly. Run tests sequentially (`--workers=1`), one test suite or filtered test at a time.
- **Run Tests Outside the Sandbox (`BypassSandbox: true`)**: All test commands MUST be executed outside the sandbox (`BypassSandbox: true`) so Playwright and the test seeders can access local server ports (`127.0.0.1:5173`, `127.0.0.1:8080`, `127.0.0.1:5001`), browser binaries, and live Google Classroom/Drive APIs.

## NPM Commands Reference

### Root Workspace ([package.json](file:///home/kieren/Documents/code/classroom-agent/package.json))
| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite frontend development server (`http://127.0.0.1:5173`). |
| `npm run build` | Type-checks (`tsc`) and builds the production Vite frontend bundle. |
| `npm run preview` | Locally previews the production frontend build. |
| `npm test -- <filter> local 1` | Runs Playwright tests sequentially via [scripts/run_tests.js](file:///home/kieren/Documents/code/classroom-agent/scripts/run_tests.js) with an optional test name or file filter. |
| `npm run test:e2e` | Runs all Playwright E2E test suites sequentially (`playwright test --workers=1`). Pass `-- -g "<test-name>"` to filter by test name. |
| `npm run test:emulator` | Runs the local Firebase Emulator Sidecar E2E suite ([workspace_layout_and_agent_copilot_test.spec.ts](file:///home/kieren/Documents/code/classroom-agent/tests/e2e/workspace_layout_and_agent_copilot_test.spec.ts)) sequentially. |
| `npm run test:live` | Runs the Live Google Classroom & Drive Sandbox E2E suite ([live_classroom_assignment_lifecycle_test.spec.ts](file:///home/kieren/Documents/code/classroom-agent/tests/e2e/live_classroom_assignment_lifecycle_test.spec.ts)) sequentially. |

### Cloud Functions Backend ([functions/package.json](file:///home/kieren/Documents/code/classroom-agent/functions/package.json))
| Command (run from `/functions`) | Description |
| :--- | :--- |
| `npm run build` | Compiles Cloud Functions TypeScript source (`functions/src`) to `functions/lib`. Must be run after editing any file in `/functions`. |
| `npm run build:watch` | Watches and incrementally compiles Cloud Functions TypeScript source. |
| `npm run serve` | Builds functions and starts the Firebase Functions emulator (`127.0.0.1:5001`). |
| `npm run shell` | Builds functions and launches the interactive Firebase Functions shell. |
| `npm run deploy` | Deploys Cloud Functions (`firebase deploy --only functions`). |
| `npm run logs` | Streams or fetches Firebase Cloud Functions logs. |
