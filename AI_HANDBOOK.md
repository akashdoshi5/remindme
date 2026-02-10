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

## 2. Data Sync Architecture (CRITICAL)

### Source of Truth
- **Firestore is the source of truth.** Local storage (localStorage) is a cache for offline access.
- On login, the app sets up realtime Firestore listeners that push cloud data → local cache.
- Local edits go: Local Store → `save()` → (async) Firestore. Firestore snapshot fires → merge back into local.

### Sync Flow
```
[User Action] → Local Store → save() → UI Update
                      ↓ (async)
                Firestore Write
                      ↓ (realtime listener)
                syncFromCloud() → Smart Merge → save() → UI Update
```

### Smart Merge Rules

#### Reminders (`syncFromCloud('reminders', data)`)
- Cloud as base, then overlay local **logs** and **exceptions** that have newer `updatedAt`.
- Tie-breaker: 'taken' status wins over 'missed'.
- **NEVER full-overwrite** — always route through `syncFromCloud()`.

#### Notes (Realtime Listener in `setUserId`)
- **Cloud wins for content** (title, text, files, attachments).
- **Local wins ONLY for `isPinned`** (ephemeral UI state).
- Exception: If local edit is within 5 seconds of current time AND newer than cloud, keep local entirely (in-flight protection).

#### Deleted Notes
- On delete: remove from local, delete Firestore doc, AND write to `users/{uid}/deletedNotes/{noteId}`.
- On login: fetch `deletedNotes` subcollection to populate `deletedNoteIds` set.
- Realtime listeners filter out any note whose ID is in `deletedNoteIds`.

### Migration
- `migrateLocalData` runs **ONLY ONCE** per user (tracked by `remindme_migrated_{uid}` in localStorage).
- Never pushes stale local data to cloud on subsequent logins.
- Guest → User migration is separate and runs only when guest data exists.

---

## 3. Key Workflows

### A. Reminders & Scheduling
- **Data Model**: `users/{uid}/reminders/{id}` in Firestore.
- **Frequencies**: 'Once', 'Daily', 'Weekly', 'Monthly', 'Every X Hours'.
- **Fixed Term**: Reminders can have a `durationDays` or `medDuration`.
    - **Critical Logic**: End Date is calculated as `StartDate + Duration`.
- **Status Tracking**:
    - **Logs**: `r.logs` map stores completion status per instance.
    - **Keys**: 
        - Modern: `YYYY-MM-DD_HH:MM` (e.g., `2026-02-09_08:00`).
        - Legacy: `M/D/YYYY` (e.g., `2/9/2026`).
        - **Intervals**: `YYYY-MM-DD_period_1` (for hourly reminders).
    - **Sync**: Reports page checks *both* key formats to support legacy app data.
- **Exceptions**: `r.exceptions[instanceKey]` for per-instance overrides (time/title/cancelled).
    - Must include `updatedAt` for merge conflict resolution.

### B. Notes & Attachments
- **Firestore Path**: Root `notes/{id}` collection (not subcollection — enables sharing).
- **Types**: `text`, `voice`, `shopping`.
- **Pinned Notes**: `isPinned` (boolean). Preserved across cloud syncs as local-only UI state.
- **Voice Notes**:
    - **Recording**: Uses `useVoice` hook.
    - **Storage**: Audio uploaded to Firebase Storage.
    - **Playback**: `audioData` field stores the *Remote URL*.
- **Deletion**: Always write to `deletedNotes` subcollection for cross-device sync.

### C. Search
- **Global Search**: `SearchModal.jsx`.
- **Scope**: Reminders (Title, Instructions) & Notes (Title, Content, *Attachments*).
- **attachments**: `extractedText` field enables searching within image/pdf content.

### D. Reports & Syncing
- **Logic**: `expandRemindersForDate` in `data.js`.
- **Fuzzy Matching**: 90-minute fuzzy match to pair scheduled slots with completed logs.
- **Display**: Shows "Scheduled: HH:MM" separately from "Taken: HH:MM".

---

## 4. "Gotchas" & Known Issues

1.  **Date Formats**:
    -   New App uses `YYYY-MM-DD` (ISO-like).
    -   Old App used `M/D/YYYY` (Locale-based).
    -   **Rule**: Always generate/check fallbacks when reading logs.

2.  **Voice Note Persistence**:
    -   **Problem**: `audioData` might be a Blob URL (temporary).
    -   **Fix**: Ensure `AddNoteModal` maps the Blob to the uploaded File URL before saving.

3.  **Sync Timing**:
    -   Firestore writes are async. The realtime listener may fire before or after local save.
    -   The 5-second "recent edit" window prevents race conditions.
    -   **NEVER do full-overwrite** of `store.reminders` or `store.notes` from a listener.

4.  **Audio Player**:
    -   Global `window.speechSynthesis` and `new Audio()` instances must be managed to prevent overlapping sound.

5.  **Migration Runs Once**:
    -   `remindme_migrated_{uid}` flag in localStorage. If cleared, migration will re-run.
    -   Use `merge: true` in `setDoc` to avoid data loss if re-run happens.

---

## 5. Testing Guide

### Manual Checks
1.  **Sync**: Edit note on web → check mobile. Delete note → install fresh APK → verify deleted note stays gone.
2.  **Pinning**: Pin 3 notes → refresh → verify all 3 remain pinned.
3.  **Voice**: Record → Save → Refresh → Play. Verify it works cross-device.
4.  **Reports**: Mark a reminder "Taken" → Check Report. Verify "Taken" status and correct time.

### Automated Tests
- Located in `src/services/tests/`.
- Run via `node` or test runner (if configured).
- Crucial Files: `comprehensive.test.js`.

---

## 6. Deployment Checklist
1.  **Web**: `npm run build` → `firebase deploy`.
2.  **Android**: `npx cap sync android` → `Open Android Studio` → `Assemble Debug` → `Install`.
3.  **Commit**: Ensure `task.md` and `walkthrough.md` are updated.
