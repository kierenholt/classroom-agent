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
