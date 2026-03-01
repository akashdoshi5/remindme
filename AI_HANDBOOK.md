#**Current Version:** v1.3.22
**Last Updated:** Feb 13, 2026

## 1. Project Overview
**RemindMe** is a productivity app for managing reminders, notes, and tasks.
- **Tech Stack:** React (Vite), Capacitor (iOS/Android), Firebase (Auth, Firestore, Storage, Functions).
- **Key Features:**
    -   Smart Reminders (Time/Location based)
    -   Rich Notes (Text, Voice, Checklist, Image)
    -   Collaborative Sharing (Real-time sync)
    -   Offline Capabilities (Firestore Persistence)

## 2. Recent Changes (v1.3.23)
- **Play Store Policy Compliance (WebViews and Affiliate Spam)**:
  - **Issue**: The Play Store rejected the app because file attachments (PDFs/Images) were being opened within an `iframe` inside the app's WebView, confusing reviewers about domain ownership and violating the "In-app experience" policy.
  - **Code Fix (`NoteCard.jsx`)**: Replaced the inline `<iframe />` file previewer with Capacitor's native system launcher. Clicking an attachment now conditionally calls `window.open(url, '_system')` on native devices to force the link to open in the user's external default browser, proving the app is not merely a web wrapper for the content.
  - **Appeals Process**: Documented the exact appeal text required to prove domain ownership of `remindme-app-9988.web.app` in `docs/PUBLISHING_GUIDE.md`.

## 2.1. Recent Changes (v1.3.22)
- **Note Sharing Persistence & Stability Fix**:
  - **Robust Merging (data.js)**: Enhanced `syncFromCloud` to merge and deduplicate `sharedWith` arrays during cloud sync, preventing data loss.
  - **Save Protection (AddNoteModal)**: Removed `sharedWith` from the `performSave` payload to prevent overwriting cloud state with stale local data.
  - **Deduplication (ShareModal)**: Added client-side deduplication during optimistic updates to prevent duplicate emails in the list.
  - **Stability Fix**: Resolved a critical React hook violation in `ShareModal.jsx` that was causing internal errors ("Expected static flag was missing").
- **UI Refinement**:
  - **Compact Shared Indicator**: Reverted to original small icons (10px) on `NoteCard.jsx` based on user preference, maintaining a clean and minimalist UI.
- **Build & Deployment**:
  - **APK Download Fix**: Performed a full clean build and synchronized the fresh `app-release.apk` to `public/android-app-release.apk` to resolve stale download issues on the Web version.
  - **Version Bump**: Increment to `v1.3.22` (Code `22`) across `package.json` and `build.gradle`.

## 2.1. Recent Changes (v1.3.19)
- **Keyboard-Aware Layout (Modals)**:
  - **Dynamic Viewport**: Switched to `h-[100dvh]` for `AddNoteModal` and `AddReminderModal` to handle viewport resizing when the virtual keyboard appears.
  - **Sticky Footers**: Replaced fixed-bottom positioning with sticky/statical flow for footers.
  - **Padding Optimization**: Reduced excessive bottom padding (`pb-48` reduced to `pb-10`) to ensure footer buttons stick to the top of the keyboard.

## 2.1. Recent Changes (v1.3.18)
- **UI Layout Fix (FAB Positioning)**:
  - **Reminders & Notes**: Increased floating action button offset from `bottom-24` to `bottom-32` and added `pb-safe`.
  - **Reasoning**: Ensures buttons clear the mobile navigation bar and system safe areas on all devices.

## 2.1. Recent Changes (v1.3.17)
- **File Preview Restoration**:
  - **Download / Open External**: Re-added the missing button to the file preview overlay when a preview is not available (regressed in v1.3.16 cleanup).
  - **Native Support**: Uses `window.open(url, '_system')` on mobile to trigger system-level handling for PDFs and other non-image files.
  - **Visuals**: Added `FileText` and `Download` icons to the "Preview not available" state for better UX.

## 2.1. Recent Changes (v1.3.16)
- **UI Architecture Refinement (AddNoteModal)**:
  - **Audio Recorder (Disc)**: Relocated to the header beside the Pin icon for grouping with meta-actions.
  - **Dictation Consolidation**: Removed duplicate Mic from the footer. A single, larger **Floating Mic** button now sits above the footer area, clearing the mobile toolbar overlay.
  - **Footer Layout**: Simplified the footer row. The language selector (EN/HI/MR) is now placed compactly next to the "Done" button.
  - **Crash Resolution**: Fixed a critical "Unterminated JSX contents" error caused by mismatched `div` tags during icon moves.
  - **Checklist Stability**: Restored Enter-key behavior and auto-focus for new checklist items.

## 2.5. Recent Changes (v1.3.10)
- **Shared Note Permissions**:
  - **Rule**: Collaborators (non-owners) **MUST NOT** see "Share" or "Delete" actions.
  - **Implementation**:
    - **Note Modal**: Hide buttons in the footer if `current_user.uid !== note.ownerId`.
    - **Floating Action Bar (Selection Mode)**: Hide buttons if *any* selected note is not owned by the user.
    - **Batch Actions**: Verify ownership on the server/handler side as a fallback.
  - **Context**: Shared notes are "view-only" or "edit-content-only" for collaborators. Logic must be applied in **BOTH** places (Modal & List/Floating Bar).
- **Checklist Conversion**:
  - **Rule**: When converting a checklist note to a reminder, **ALL** items (checked and unchecked) must be transferred to the Reminder's "Instructions" field.
  - **Format**: Use a bulleted list format (e.g., `- Item 1\n- Item 2 (Done)`).
- **Alarm Vibration**:
  - **Rule**: Native notifications must use the same aggressive vibration pattern as the in-app alarm (`[0, 500, 200, 500, 200, 1000]`).
  - **Implementation**: Sync `NotificationChannel.vibrationPattern` with `haptics.alarm()`.
- **UI Cleanup**:
  - **Rule**: Do not display debug info (like version numbers) in user-facing modals (e.g., AddNoteModal footer).
- **Audio Limits**:
  - **Rule**: Skip transcription for `.webm` (video/mime) to prevent hangs. Max file size: 5MB for audio, 13MB for attachments.).

---

## 3. Data Sync Architecture (CRITICAL)

### Source of Truth
- **Firestore is the source of truth.** Local storage (localStorage) is a cache for offline access.
- On login, `setUserId()` in `data.js` sets up realtime Firestore listeners that push cloud data → local cache.
- Local edits go: Local Store → `save()` → (async) Firestore. Firestore snapshot fires → merge back into local.

### ⚠️ Single Listener Pattern (CRITICAL)
- **ALL realtime listeners are managed ONLY in `setUserId()` (data.js).**
- `useDataSync.js` only calls `setUserId()` — it MUST NOT set up its own listeners.
- **NEVER create duplicate listeners** — this was the root cause of a sync conflict bug where two listener paths (one with smart merge, one with overwrite) would race and clobber data.

### Sync Flow
```
[User Action] → Local Store → save() → UI Update
                      ↓ (async)
                Firestore Write
                      ↓ (realtime listener in setUserId)
                Smart Merge → save() → UI Update
```

### Smart Merge Rules

#### Reminders (`syncFromCloud('reminders', data)`)
- Cloud as base, then overlay local **logs** and **exceptions** that have newer `updatedAt`.
- Tie-breaker: 'taken' status wins over 'missed'.
- **NEVER full-overwrite** — always route through `syncFromCloud()`.

#### Notes (`syncFromCloud('notes', data)` AND `setUserId` listener)
- **Robust Field-Level Merge**:
    - **Text**: If collision (both changed), **concatenate** both with a separator (`--- [Synced Version] ---`) to prevent data loss.
    - **Checklists**: **Union** of items (merge by text content).
    - **Attachments/Files**: **Union** of unique files (by name/size or URL).
    - **Audio**: Keep version with **latest timestamp**.
- **Local wins for `isPinned`** (ephemeral UI state).
- **In-flight protection**: `AddNoteModal` uses `isDirtyRef` to prevent background sync from overwriting active user edits.
- **Offline Creation**: Notes created offline are preserved and merged when online.
- **Safety**: No "recent edit" threshold for merge; generally prefers **latest `updatedAt`** but safeguards data via concatenation/union.

#### Cross-Device Conflict Prevention (AddNoteModal)
- **Dirty Tracking**: `isDirtyRef` tracks whether the **user** has made a local edit.
- **Sync Suppression**: `isSyncingRef` is `true` while applying remote sync updates from `getNoteRealtime`.
- **Auto-save guard**: The 1.5s debounced auto-save **only fires** when `isDirtyRef.current === true`.
- **Reset on init**: `isDirtyRef` resets to `false` when a note is opened/initialized.
- **Reset on save**: `isDirtyRef` resets to `false` after a successful save.
- **Why**: Without this, idle clients receiving remote updates would re-trigger auto-save, writing stale local state back to Firestore and overwriting the active device's changes.

#### Deleted Notes
- On delete: remove from local, delete Firestore doc, AND write to `users/{uid}/deletedNotes/{noteId}`.
- On login: fetch `deletedNotes` subcollection to populate `deletedNoteIds` set.
- Realtime listeners filter out any note whose ID is in `deletedNoteIds`.

### Migration
- **Step 1**: Fetch `deletedNoteIds` from Cloud. This prevents "zombie notes" (deleted on other devices) from being resurrected if they exist in stale local storage.
- **Step 2**: Filter local `store.notes` against `deletedNoteIds`.
- **Step 3**: `migrateLocalData` runs (if not already migrated). Pushes only valid, non-deleted local notes to Cloud.
- Uses `merge: true` in `setDoc` — safe to run, but strictly filtered now.
- Guest → User migration is separate and runs only when guest data exists.

---

## 3. Key Workflows

### A. Reminders & Scheduling
- **Data Model**: `users/{uid}/reminders/{id}` in Firestore.
- **Frequencies**: 'Once', 'Daily', 'Weekly', 'Monthly', 'Every X Hours'.
- **Fixed Term**: Reminders can have a `durationDays` or `medDuration`.
- **Advanced Scheduling Logic (v1.3.11)**:
    - **"Every X Hours"**:
        - **Daily Reset**: Schedules reset to the user's "Wake Up Time" (calculated from `sleepEnd`, default ~08:00 AM) on each new day. This ensures medication schedules don't drift overnight.
        - **Timestamp Accuracy**: Auto-completed past instances MUST use `inst.displayTime` (the specific scheduled slot, e.g., "14:00") for the `takenAt` timestamp, NOT the current time or the series start time.
    - **Weekly/Monthly/Custom**:
        - **Weekly**: Matches only if `currentDate.getDay() === startDate.getDay()`.
        - **Monthly**: Matches only if `currentDate.getDate() === startDate.getDate()`.
        - **Custom**: Parses "Mon, Wed, Fri" strings and matches against `currentDate`'s short day name.
        - **Legacy Fallback**: If frequency is unknown, defaults to Daily (safe fallback).

### B. Input Validation (AddReminderModal)
- **Meal Times**:
    - **Ranges**: Breakfast (07-11), Lunch (11-16), Dinner (18-22).
    - **Strict Enforcement**: An `onBlur` handler automatically clamps invalid times (e.g., 03:00) to the nearest valid boundary (e.g., 07:00).
- **Time Input Visibility**:
    - **Rule**: The standard Time input must ALWAYS be visible if `type !== 'Medication'`, even if the "Complex Schedule" toggle was previously enabled.
- **Duration**:
    - **Manual Input**: Users can type a specific number of days alongside the slider.
    - **Minimum**: Enforced to 1 day.
    - **Critical Logic**: End Date is calculated as `StartDate + Duration`.
- **Anchor Time Logic**: For "Every X Hours" intervals, the system resets the anchor to `sleepEnd` (default 08:00) on all *subsequent* days to align with the wake window.
    - *Note*: Only the Start Date respects the specific `r.time` (e.g. 12:00 PM start). Days 2+ start at 08:00 AM.
- **Status Tracking**:
    - **Logs**: `r.logs` map stores completion status per instance.
    - **Keys**: 
        - Modern: `YYYY-MM-DD_HH:MM` (e.g., `2026-02-09_08:00`).
        - Legacy: `M/D/YYYY` (e.g., `2/9/2026`).
        - **Intervals**: `YYYY-MM-DD_period_1` (for hourly reminders).
    - **Sync**: Reports page checks *both* key formats to support legacy app data.
- **Exceptions**: `r.exceptions[instanceKey]` for per-instance overrides (time/title/cancelled).
    - Must include `updatedAt` for merge conflict resolution.

### B. Reminder Deletion Rules
- **Single Instance Delete** ("Delete This Event Only"):
    - Allowed for: **yesterday, today, and future** dates.
    - Mechanism: Creates an exception with `status: 'cancelled'` via `updateReminder(id, { status: 'cancelled' }, instanceKey)`.
    - Locked for: 2+ days ago (controlled by `dayBeforeYesterday` cutoff in `RemindersPage.jsx`).
- **Series Delete** ("Delete Entire Series"):
    - For past-started recurring reminders: **Soft delete** — sets `endDate` to `today - 2 days` to preserve history.
    - For future/non-recurring: **Hard delete** — removes from store and Firestore.
    - The soft-delete endDate ensures yesterday's instances still appear in history/reports.

### C. Notes & Attachments
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
    -   `remindme_migrated_{uid}` flag in localStorage. If cleared (e.g. new APK install clears app data), migration will re-run.
    -   **Safe**: Uses `merge: true` in `setDoc`, so re-running migration won't overwrite newer cloud data.
    -   Phone notes that weren't synced to web will be merged (not overwritten) on new APK install.

6.  **Duplicate Listeners (FIXED)**:
    -   **Bug**: `useDataSync.js` previously set up its own Firestore listeners IN ADDITION to `setUserId()` listeners.
    -   The `useDataSync` listeners called `syncFromCloud('notes', ...)` which used simple overwrite.
    -   The `setUserId` listeners used smart merge. Both ran simultaneously.
    -   **Fix**: `useDataSync.js` now only calls `setUserId()`. `syncFromCloud` now also uses smart merge.

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

### Play Store Release (Signed AAB)
1.  **Run Build Script**: `./scripts/build-release.ps1`
2.  **Output**: `android/app/build/outputs/bundle/release/app-release.aab`
3.  **Upload**: Drag to Play Console.
    *   *Keystore*: `android/app/upload-keystore.jks`
    *   *Password*: `remindme123` (See `android/gradle.properties`)

### Web & Debug
1.  **Web**: `npm run build` → `firebase deploy`.
2.  **Android**: `npx cap copy android` (to sync assets) OR `npx cap sync android` (to sync assets AND plugins) → `Open Android Studio` → `Assemble Debug` → `Install`.
    - **CRITICAL**: If you only run `./gradlew assembleDebug` without `npx cap copy`, the APK will contain **STALE** web assets.
3.  **Commit**: Ensure `task.md` and `walkthrough.md` are updated.

---

## 7. Haptics & Vibration
- **Service**: `src/services/haptics.js` (Singleton).
- **Philosophy**:
    - **UI Feedback**: Use `Capacitor Haptics` (Taptic Engine). Crisp, short, localized.
        - `haptics.light()`: Toggles, tabs, subtle interactions.
        - `haptics.medium()`: Primary actions (Pull-to-refresh, Snooze, Complete).
        - `haptics.heavy()` / `selection()`: Destructive actions, long-press, reorder.
    - **Alarms**: Use `navigator.vibrate` (Web API).
        - **Pattern**: `[500, 200, 500, 200, 1000]` (Aggressive Pulse).
        - **Reason**: Taptic engine is too weak for wake-up alarms; `navigator.vibrate` allows long buzzing.
- **Settings Preview**:
    - "Standard": Plays `haptics.notification()` (Double buzz).
    - "Alarm": Plays `haptics.alarm()` (Full aggressive pattern).

---

## 8. Recent Regression Fixes
The following critical regressions were discovered and fixed during recent development:

1.  **Mic Crash (APK)**:
    - **Problem**: Repeatedly tapping the microphone button caused an `InvalidStateError`.
    - **Fix**: Added a guard clause in `useVoice.js` to prevent starting if already listening.
2.  **Share functionality Restoration**:
    - **Problem**: Native OS share replaced the custom collaborative sharing modal.
    - **Fix**: Centralized the `ShareModal` in `UIContext.jsx` and `App.jsx`, ensuring it is accessible via the "Share" button in Notes.
3.  **Reminder Modal Loop**:
    - **Problem**: Opening the modal from the Home Page via `?add=true` caused a navigation loop because `window.history.replaceState` didn't update React Router.
    - **Fix**: Replaced `replaceState` with `navigate(location.pathname, { replace: true })`.
4.  **ReferenceError in NotesPage**:
    - **Problem**: Lingering `useEffect` block referenced `sharingNote` after it was moved to context.
    - **Fix**: Removed obsolete `useEffect` in `NotesPage.jsx`.
5.  **Cross-Device Note Overwrite (Idle Client)**:
    - **Problem**: When the same note is open on web (idle) and phone, the idle web auto-saved stale state back to Firestore, overwriting changes/attachments made on the phone.
    - **Root Cause**: `AddNoteModal`'s debounced auto-save fired on ANY state change, including remote sync updates from `getNoteRealtime`, creating a feedback loop.
    - **Fix**: Added `isDirtyRef` + `isSyncingRef` in `AddNoteModal.jsx`. Auto-save now only triggers when the user has actually made a local edit. Remote sync state changes are suppressed from marking dirty.
7.  **Mic Error on Mobile (Android)**:
    - **Problem**: `window.SpeechRecognition` (Web Speech API) is unreliable/unsupported in standard Android WebViews, causing errors even with permissions granted.
    - **Fix**: Integrated `@capacitor-community/speech-recognition` plugin. Refactored `useVoice.js` to use the native plugin on mobile (Hybrid implementation) while keeping Web Speech API for the PWA.
    - **Problem**: Share modal appeared behind Note modal (z-index issue) and didn't update the list of shared users immediately.
    - **Fix**: Increased `ShareModal` z-index to 200 and added local state tracking for immediate UI updates.
7.  **Voice Note Playback Error**:
    - **Problem**: `NoteCard` passed full note object to `handlePlayAudio`, but `NotesPage` expected `(noteId, audioData)`.
    - **Fix**: Updated `NotesPage` handler to accept note object, extract audio data, and added toggle logic to stop playing if clicked again.
8.  **Alarm Prominence**:
    - **Problem**: Alarm sound/vibration was too subtle for some users on both Web and Android.
    - **Fix**: Increased web audio gain to 0.7, doubled the alarm sound sequence per loop, and extended the native vibration pattern to a double-pulse sequence.
10. **Mobile Microphone & Playback Robustness (v1.3.0)**:
    - **Problem**: "Mic error" persisting on some devices; recordings lost due to temporary `blob:` URLs being saved to cloud.
    - **Fix**: Refactored `AddNoteModal` to use synchronous upload-and-save logic. Ensuring native `capacitor-voice-recorder` permissions are checked EXPLICITLY before start. Added playback error handling in `NotesPage.jsx`.
11. **Note Type Conversion Data Loss (v1.3.1)**:
    - **Problem**: Switching between 'Text' and 'Checklist' modes in the Add Note modal caused the alternative content to be lost.
    - **Fix**: Implemented bi-directional mapping in `AddNoteModal.jsx`. 
        - **Text to Checklist**: Splits text lines into individual items.
        - **Checklist to Text**: Joins all list items into a single block of text.
12. **Conversion Crash & Close Button Accessibility (v1.3.2)**:
    - **Problem**: Switching to checklist mode with empty content caused a `TypeError`. Also, the 'X' was hard to reach.
    - **Fixes**: Added safety checks and a "Done" button at the bottom right.
13. **Stability & Mobile UX (v1.3.5 - v1.3.7)**:
    - **Problem**: Checklist-to-Note conversion logic was corrupted; "Done" button hidden on mobile.
    - **Fixes**: 
        - **Explicit Mode Conversion (v1.3.7)**: Switching between Text and Checklist now explicitly converts the data and **clears the alternative field**. This prevents stale cloud sync logs from overwriting converted data.
        - **Visible Versioning**: Added `v1.3.7` badge for deployment tracking.
        - **Mobile Layout**: Reduced modal height to `90dvh` and used `shrink-0` on toolbar to prevent clipping.
14. **Android Asset Desync (v1.3.7)**:
    - **Problem**: Web app was updated but Android APK still showed old version/bugs.
    - **Root Cause**: Skipping `npx cap copy` or `npx cap sync` during build. Android Studio / Gradle does NOT automatically pull the latest `dist` folder changes unless synced via Capacitor CLI.
    - **Fix**: Always run `npx cap copy android` before building the APK.
15. **Capacitor Plugin / Java Version Conflict (v1.3.7)**:
    - **Problem**: Build failed with `invalid source release: 21` or "VoiceRecorder plugin not implemented" alert on phone.
    - **Root Cause**: `capacitor-voice-recorder@6.1.0` and above require Java 21, but the current build environment uses JDK 17.
    - **Fix**: Downgraded to `capacitor-voice-recorder@6.0.1` which is compatible with Java 17. (See `node_modules/capacitor-voice-recorder/android/build.gradle` for `compileOptions` constraints).
16. **Notes Filter Bug (v1.3.8)**:
    - **Problem**: "Lists" tab showed only `shopping` type notes, missing `list` types created via checklist conversion.
    - **Fix**: Updated filter to include both `shopping` and `list`.
17. **Alarm Vibration Weakness (v1.3.8)**:
    - **Problem**: Android notifications used standard vibration, which was too subtle for alarms.
    - **Fix**: Implemented `reminders_alarm_v2` channel with a custom, aggressive vibration pattern matching `haptics.alarm()`.
18. **Sync Data Loss (v1.3.8)**:
    - **Problem**: Simple overwrite logic caused data loss when offline edits conflicted with cloud updates.
    - **Fix**: Implemented robust merge strategy (concatenation for text, union for lists/files) in `data.js`.

## 9. UI Improvements
1.  **Note Title Relocation**:
    - **Change**: Moved the Note Title input from the fixed header to the top of the content area.
    - **Reasoning**: To declutter the header and provide a better focus on the content. The title is now bold and prominent within the note body.
    - **Feature**: Added dynamic placeholder logic. If no title is entered, the input placeholder shows a preview of the derived title (from text/checklist).

2.  **Search Scroll-to-Position**:
    - **Change**: Clicking a search result for a Note now opens the note and automatically scrolls to the matched text.
    - **Implementation**: `SearchModal` passes the query to `NotesPage`, which opens `AddNoteModal` with a `searchQuery` prop, triggering a scroll effect.
    - **v1.2.8 Refinement**: Improved scroll reliability by explicitly calling `scrollIntoView` and adding a 500ms stabilization delay to ensure the modal layout is ready before highlighting.


3.  **Snooze UI Refinements (v1.2.7)**:
    - **Notification Label**: Changed to "Snooze 5 min" for better clarity.
    - **Action ID**: Bumped from `REMINDER_ACTIONS_V10` to `V11` to force OS-level button updates on Android.
    - **Reminder Card**: Updated Snooze button to always show "+5m" text next to the icon (removed responsive hide logic) to reduce user ambiguity.
    - **Alarm Modal**: Prepending "+" to all snooze options (e.g., "+5m", "+10m") for visual consistency with the reminder list.

---

9.  **Deleted Notes Resurrection (Fresh Install)**:
    - **Problem**: On new install/update, stale local notes (deleted on other devices) were "resurrected" because Migration ran *before* fetching the list of deleted IDs from cloud.
    - **Fix**: Reordered `data.js` `setUserId` flow. Now fetches `deletedNoteIds` first, then filters local data, then runs Migration.
    - **Fix**: Reordered `data.js` `setUserId` flow. Now fetches `deletedNoteIds` first, then filters local data, then runs Migration.

## 10. Versioning Strategy
- **Source of Truth**: `package.json` (`version` field).
- **Usage**:
    - **AddNoteModal.jsx**: Imports `package.json` to display version (e.g., "v1.3.8") in the saved indicator.
    - **AppVersionManager.jsx**: Checks `package.json` against Firestore `config/app_version` to prompt updates.
    - **SettingsModal.jsx**: Displays version in the footer.
- **Update Process**:
    1.  Bump version in `package.json`.
    2.  Run `npm run build` (Vite embeds the JSON version).
    3.  Deploy.

To maintain stability across platforms (Web/Android), the AI must follow this strict SDLC process for every task:

### 1. Planning & Understanding
- **Understand the App**: Read the `AI_HANDBOOK.md` and codebase before making changes.
- **Impact Analysis**: Ensure changes do not break existing functionality. If a change impacts other parts of the app, **reverify them all** and inform the user before proceeding.

### 2. Implementation & Execution
- **Refactor & Fix**: Fix the requested issue while refactoring for clarity according to established patterns.
- **Resource Management**: Cleanup unused imports, variables, and temporary files after the fix.
- **Security**: Always verify `firestore.rules` after any schema or collection changes.

### 3. Verification & Testing
- **Add Test Cases**: Write new tests in `src/services/tests/` for new functionality.
- **Run All Tests**: Execute the full test suite (`node src/services/tests/comprehensive.test.js`) and fix any failures.
- **Functionality Reverification**: Manually verify the specific fixed functionality on both Web and Android.

### 4. Build & Deployment
- **Build Verification**: Run `npm run build` locally. Fix any build/minification issues immediately.
- **Web Deployment**: Deploy successfully to Firebase Hosting using `npx firebase deploy`.
- **Android APK**: Create a fresh debug APK via Capacitor (`npx cap sync android` + `.\gradlew.bat assembleDebug`).

### 5. Documentation & Handover
- **Update Handbook**: Always update this `AI_HANDBOOK.md` with new architectural decisions, "gotchas," and regression fixes.
- **Handover**: Maintain an accurate `task.md` and provide a detailed `walkthrough.md`.

