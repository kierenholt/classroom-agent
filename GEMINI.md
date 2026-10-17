# Classroom Agent — Architecture & Project Reference

## Overview
Classroom Agent is an AI-native grading and feedback workstation for Google Classroom built around a **70% Tabbed Assignment Workspace + 30% Persistent Streaming Agent Co-Pilot Pane** layout.

## GCP & Firebase Project Configuration
- **Project ID**: `classroom-agent-511917` (Project Number: `82833838117`)
- **Firebase Web App ID**: `1:82833838117:web:6646420fa24876a1112fcc` (`classroom-agent-web`)
- **Cloud Firestore**: `(default)` Native database in `nam5` with real-time updates enabled
- **Authentication**: Firebase Auth with Google Sign-In provider (`Classroom Agent`)

## Key Architecture & Configuration Files
- [PRD.md](file:///home/kieren/Documents/code/classroom-agent/PRD.md): Full Product Requirements Document covering the 70/30 layout, 3-zone assignment workspace (Student Roster, Multi-format Submission Preview Canvas, Rubric Breakdown & Comments Panel), Google Classroom & Drive API direct write-back (`draftGrade` / `assignedGrade` + `return`), Firestore schema, and SSE agent tool loop (`evaluate_and_grade_submission` per student).
- [architecture.md](file:///home/kieren/Documents/code/classroom-agent/architecture.md): System topology, directory layout, OAuth/token forwarding flow, and GCP/Firebase setup guide for `classroom-agent-511917`.
- [agent_pane_design_plan.md](file:///home/kieren/Documents/code/classroom-agent/agent_pane_design_plan.md): Reference blueprint for the 30% persistent streaming agent co-pilot pane (`ChatPanel.tsx`, `ToolCallBadge.tsx`, `api.ts` SSE consumer, Gemini `thought_signature` preservation, and CSS `hidden` tab persistence).
- [.firebaserc](file:///home/kieren/Documents/code/classroom-agent/.firebaserc) & [firebase.json](file:///home/kieren/Documents/code/classroom-agent/firebase.json): Binds the workspace to `classroom-agent-511917` and configures Cloud Functions (`\functions`), Firestore (`8080`), Auth (`9099`), Storage (`9199`), Functions (`5001`), and Emulator UI (`4000`).
- [firestore.rules](file:///home/kieren/Documents/code/classroom-agent/firestore.rules) & [storage.rules](file:///home/kieren/Documents/code/classroom-agent/storage.rules): Security rules for `assignments/{assignmentId}`, `submissions/{studentId}`, `messages/{messageId}`, and `/uploads/**`.
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
- [src/components/workspace/AssignmentWorkspace.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/workspace/AssignmentWorkspace.tsx): Container orchestrating Zones A, B, and C with Firestore `onSnapshot` subscriptions.
- [src/components/agent/ChatPanel.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/agent/ChatPanel.tsx): 30% persistent agent co-pilot pane with dual-state Firestore sync and prompt starters.
- [src/components/agent/ToolCallBadge.tsx](file:///home/kieren/Documents/code/classroom-agent/src/components/agent/ToolCallBadge.tsx): Collapsible tool telemetry badge with argument and result inspectors.
- [src/components/agent/api.ts](file:///home/kieren/Documents/code/classroom-agent/src/components/agent/api.ts): Chunk-resilient SSE stream consumer with fail-fast auth token verification.

### Cloud Functions Backend (`/functions`)
- [functions/src/config/env.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/config/env.ts): Fail-fast server environment validator.
- [functions/src/middleware/auth.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/middleware/auth.ts): Express middleware verifying Firebase ID token and `X-Google-Access-Token`.
- [functions/src/services/classroomClient.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/services/classroomClient.ts): Google Classroom v1 and Drive v3 SDK client wrappers.
- [functions/src/services/driveExtractor.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/services/driveExtractor.ts): Document and submission extractor for Docs, Slides, Sheets, Code, and binary assets.
- [functions/src/tools/gradingTools.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/tools/gradingTools.ts): Gemini tool declarations and executors (`get_assignment_details`, `set_assignment_rubric`, `list_student_submissions`, `get_student_submission_content`, `evaluate_and_grade_submission`, `return_student_submissions`).
- [functions/src/routes/chat.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/routes/chat.ts): `POST /api/chat` SSE endpoint with Gemini loop and `thought_signature` preservation.
- [functions/src/routes/classroom.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/routes/classroom.ts): REST endpoints for courses, coursework, clone, sync, drive preview, grade, and return.
- [functions/src/routes/upload.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/routes/upload.ts): Multipart upload for rubric attachments to Cloud Storage.
- [functions/src/index.ts](file:///home/kieren/Documents/code/classroom-agent/functions/src/index.ts): Express application exported as 2nd Gen Cloud Function `api`.

### Testing & Verification
- [scripts/run_tests.js](file:///home/kieren/Documents/code/classroom-agent/scripts/run_tests.js): Sequential Playwright test runner (`node scripts/run_tests.js <name> local 1`).
- [playwright.config.ts](file:///home/kieren/Documents/code/classroom-agent/playwright.config.ts): Playwright test configuration targeting `http://127.0.0.1:5173`.
- [tests/helpers/testSeeder.ts](file:///home/kieren/Documents/code/classroom-agent/tests/helpers/testSeeder.ts): Emulator fixture seeder and teardown utility (zero mock data in production).
- [tests/e2e/workspace_layout_and_agent_copilot_test.spec.ts](file:///home/kieren/Documents/code/classroom-agent/tests/e2e/workspace_layout_and_agent_copilot_test.spec.ts): E2E test suite verifying workspace layout and agent co-pilot.

