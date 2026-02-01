# AI Handbook: RemindMeBuddy
> **CRITICAL REFERENCE** - Do not modify this application without reviewing this document.

## 1. Core Philosophy
RemindMeBuddy is a high-reliability Personal Assistant application. Users rely on it for critical reminders (Medication, Health). **Reliability > New Features**.
Any change must **preserve** existing functionality. Regressions in Notifications, Sharing, or Data Persistence are unacceptable.

## 2. Regression Protection Rules
Before finalizing ANY change, you MUST verify these core pillars:

### A. Notifications & Scheduling
1.  **Missing Reminders**: NEVER touch `scheduleReminders` logic in `useNotifications.js` unless fixing a specific scheduling bug.
2.  **Overwrite Protection**: Identify reminders by `uniqueId` OR composite `${id}_${instanceKey}`. Using simple `id` overwrites recurring instances.
3.  **Permissions**: Always `checkPermissions()` on app resume (`App.jsx`).

### B. Data & sharing (CRITICAL)
1.  **Shared Notes**: When updating a note (`addNote`, `updateNote`), **ALWAYS** preserve the `sharedWith` array.
    -   *Bad*: `firestoreService.updateNote(id, { ...updates })` (If `sharedWith` is missing in updates, it might be wiped if sending replacement object).
    -   *Good*: Merge locally first, or explicitly pass existing `sharedWith`.
2.  **Caregiver Mode**:
    -   If `activeProfile` is set (Viewing Patient), `dataService` methods must be **Read Only** or restricted.
    -   NEVER allow a Caregiver to edit a Patient's core settings or delete their account.
3.  **Reminders Persistence**:
    -   **Series vs Instance**: Files attached to a reminder must handle "This Instance" edits by saving files to the **Series** (Parent ID) so they remain visible in future.
    -   **History**: Do not hard-delete recurring reminders with past history. Use "Soft Delete" (Set `endDate` to yesterday).

### C. Search & Navigation
1.  **Global Search**: The Search Icon must be visible on **ALL** pages (Home, Reminders, Notes).
    -   Mobile: Floating icon or Header icon.
    -   Desktop: Header Search Bar.
2.  **Scope**: Search must cover:
    -   Reminders (Title, Instructions)
    -   Notes (Title, Content)
    -   **Attachments** (File Names, Extracted Text)

## 3. Detailed Feature Specifications
(Reference this when modifying specific areas)

### Reminders (The Core)
-   **Frequency**: Supports `Daily`, `Weekly`, `Monthly`, `Every X Hours`.
-   **Logs**: Execution history (`taken`, `missed`, `snoozed`) is stored in `logs.<instanceKey>`.
-   **Exceptions**: Moving a recurring instance creates an entry in `exceptions.<instanceKey>`.

### Notes
-   **Structure**: `id`, `title`, `content`, `tags`, `files`, `sharedWith` (Array of emails).
-   **Sharing**: Real-time sync via `useDataSync.js` fetching `getSharedNotesRealtime`.

### Caregivers (V2)
-   **Collections**: `users/{uid}/caregivers` (People watching me) and `users/{uid}/patients` (People I watch).
-   **Security**: Firestore Rules enforce `read` access only for accepted caregivers.

## 4. AI Prompt for Future Sessions
*Copy this prompt when starting a new session to ensure context:*

> "I am working on RemindMeBuddy, a critical health-focused reminder app.
> **Constraint**: You must NOT break existing functionality:
> 1. Notifications must trigger reliably.
> 2. Shared Notes must remain shared after edits.
> 3. Search must be accessible from Home.
> 4. Caregiver view must be read-only for data.
> Check `AI_HANDBOOK.md` for specific implementation rules before proposing code."
