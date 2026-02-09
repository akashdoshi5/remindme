# RemindMeBuddy AI Handbook

## 1. Project Overview
**RemindMeBuddy** is a React (Vite) + Firebase application designed for caregivers and patients to manage medication and tasks. It includes a mobile app (Capacitor/Android) and a web dashboard.

### Core Tech Stack
- **Frontend**: React, TailwindCSS, Framer Motion, Lucide React.
- **Backend**: Firebase (Firestore, Auth, Storage).
- **Mobile**: Capacitor (Android).
- **State Management**: React Context (`AuthContext`, `ThemeContext`) + Local Component State.
- **Services**: `dataService` (Singleton for Firestore/Local interactions).

---

## 2. Key Workflows

### A. Reminders & Scheduling
- **Data Model**: `reminders` collection.
- **Frequencies**: 'Once', 'Daily', 'Weekly', 'Monthly', 'Every X Hours'.
- **Fixed Term**: Reminders can have a `durationDays` or `medDuration`.
    - **Critical Logic**: End Date is calculated as `StartDate + Duration`.
    - **Display**: Search modal shows "Start → End" properly.
- **Status Tracking**:
    - **Logs**: `r.logs` map stores completion status.
    - **Keys**: 
        - Modern: `YYYY-MM-DD` (e.g., `2026-02-09`).
        - Legacy: `M/D/YYYY` (e.g., `2/9/2026`).
        - **Intervals**: `YYYY-MM-DD_period_1` (for hourly reminders).
    - **Sync**: Reports page checks *both* key formats to support legacy app data.

### B. Notes & Attachments
- **Types**: `text`, `voice`, `shopping`.
- **Pinned Notes**: 
    - `isPinned` (boolean) field.
    - **Gotcha**: Navigation between tabs must clear `searchQuery` state, otherwise pinned notes might be hidden by a stale filter.
- **Voice Notes**:
    - **Recording**: Uses `useVoice` hook.
    - **Storage**: Audio uploaded to Firebase Storage.
    - **Playback**: `audioData` field stores the *Remote URL*.
    - **UI**: `NoteCard` has a built-in player. `handlePlayAudio` manages the singleton audio instance (only one plays at a time).

### C. Search
- **Global Search**: `SearchModal.jsx`.
- **Scope**: Reminders (Title, Instructions) & Notes (Title, Content, *Attachments*).
- **Attachments**:
    - **OCR/Text**: `extractedText` field in file objects allows searching within image/pdf content.
    - **Preview**: Clicking a match opens `TextPreviewModal` (supports Text & Images).

### D. Reports & syncing
- **Logic**: `expandRemindersForDate` in `data.js`.
- **Fuzzy Matching**: Due to potential timezone/timer drifts (±1 hour), the system uses a 90-minute fuzzy match to pair a "Scheduled" slot with a "Completed" log.
- **Display**: Shows "Scheduled: HH:MM" separately from "Taken: HH:MM".

---

## 3. "Gotchas" & Known Issues

1.  **Date Formats**:
    -   New App uses `YYYY-MM-DD` (ISO-like).
    -   Old App used `M/D/YYYY` (Locale-based).
    -   **Rule**: Always generate/check fallbacks when reading logs.

2.  **Voice Note Persistence**:
    -   **Problem**: `audioData` might be a Blob URL (temporary).
    -   **Fix**: Ensure `AddNoteModal` maps the Blob to the uploaded File URL before saving to Firestore.

3.  **Search Persistence**:
    -   **Problem**: Search query sticks in `location.state`.
    -   **Fix**: `NotesPage` strictly syncs input with `location.state` and clears it on "Sidebar Click" (clean navigation).

4.  **Audio Player**:
    -   Global `window.speechSynthesis` and `new Audio()` instances must be managed to prevent overlapping sound.

---

## 4. Testing Guide

### Manual Checks
1.  **Pinning**: Pin a note -> Switch Tabs -> Return. Verify it's still there.
2.  **Voice**: Record -> Save -> Refresh -> Play. verify it works.
3.  **Search**: Search for text inside an image attachment. Click "Preview".
4.  **Reports**: Mark a reminder "Taken" -> Check Report. Verify "Taken" status and correct time.

### Automated Tests
- Located in `src/services/tests/`.
- Run via `node` or test runner (if configured).
- Crucial Files: `comprehensive.test.js`.

---

## 5. Deployment Checklist
1.  **Web**: `npm run build` -> `firebase deploy`.
2.  **Android**: `npx cap sync android` -> `Open Android Studio` -> `Assemble Debug` -> `Install`.
3.  **Commit**: Ensure `task.md` and `walkthrough.md` are updated.
