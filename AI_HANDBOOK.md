# AI Handbook: RemindMeBuddy
> **CRITICAL REFERENCE** - Do not modify this application without reviewing this document.

## 1. Core Philosophy
RemindMeBuddy is a high-reliability Personal Assistant application. Users rely on it for critical reminders (Medication, Health). **Reliability > New Features**.
Any change must **preserve** existing functionality. Regressions in Notifications, Sharing, or Data Persistence are unacceptable.

### Reliability Features (V10.20+)
- **Optimistic UI**: Local state updates *immediately* on user action (Save/Done/Snooze/Notes).
- **Background Sync**: Firestore SDK auto-queues writes.
- **Sync Status**: `useSyncStatus` hook tracks `navigator.onLine` and `waitForPendingWrites` to show a cloud icon in the Menu (Green = Synced, Blue = Syncing, Grey = Offline).
- **Smart Merge**: `syncFromCloud` merges logs to prevent overwriting pending local changes.

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
-   **Frequency**: Supports `Daily`, `Weekly`, `Monthly` (Same day of month), `Every X Hours`.
-   **Duration**: Up to 3 Years (1095 days).
-   **Logs**: Execution history (`taken`, `missed`, `snoozed`) is stored in `logs.<instanceKey>`.
-   **Exceptions**: Moving a recurring instance creates an entry in `exceptions.<instanceKey>`.

#### Date Calculations & Series Management (CRITICAL)

##### Auto-Complete Logic (V10.8+)
When a reminder is **created** or **updated**, the system automatically marks past instances as 'taken':

1. **Trigger**: Runs in `addReminder()` and `updateReminder()` in `data.js`
2. **Logic**:
   - Loops from `startDate` to `today` (max 365 days)
   - For each date, expands instances using `expandRemindersForDate()`
   - Marks instances as 'taken' if:
     - Date is before today, OR
     - Date is today AND time has passed
3. **Implementation**: Calls `updateReminder(id, { logs })` to save the auto-completed logs
4. **CRITICAL**: The `{ logs }` update must NOT trigger series-splitting (see below)

##### Series Splitting (History Preservation)
When editing a recurring reminder with past history, the system may "split" the series to preserve old data:

**When Splitting Occurs**:
- User edits "All Future Events" of a recurring reminder
- The reminder's `startDate < yesterday`
- The update includes fields OTHER than just `logs` (e.g., title, time, schedule changes)

**Splitting Process** (`updateReminder()` in `data.js`):
1. **End Old Series**: Set `endDate` to the day before the new `startDate`, mark as `status: 'ended'`
2. **Create New Series**: Create a new reminder with a new ID, starting from the new `startDate`
3. **Auto-Complete New Series**: Mark any past instances in the new series as 'taken'
4. **Firestore**: Update old series, add new series

**V10.18 CRITICAL FIX**: 
- **Problem**: Auto-complete was calling `updateReminder({ logs })`, which triggered series-splitting for past reminders
- **Result**: Creating a reminder with past start date created TWO series (one past, one future)
- **Fix**: Added `isLogsOnlyUpdate` check to skip series-splitting when ONLY logs are being updated:
  ```javascript
  const isLogsOnlyUpdate = Object.keys(updates).length === 1 && updates.logs;
  if (!isLogsOnlyUpdate && isRecurring && startDate && startDate < yesterdayStr) {
      // Series splitting logic
  }
  ```

##### Date Handling in AddReminderModal (V10.15+)
When editing "All Future Events" of a past series:

1. **Default Start Date**: Set to `Today` (not the original past start date)
2. **Reason**: Prevents accidental data loss/history rewrite
3. **Exception**: If user explicitly selects a future date via `instanceKey` or `originalStart`, respect it
4. **Duration Recalculation (V10.16)**: If start date changes during split, recalculate `durationDays` to preserve the original end date:
   ```javascript
   const originalEnd = new Date(originalStart);
   originalEnd.setDate(originalEnd.getDate() + originalDuration - 1);
   const newDuration = Math.ceil((originalEnd - newStart) / (1000*60*60*24)) + 1;
   ```

##### Schedule Preview (V10.17)
The modal shows a **live preview** of the series schedule:
- Calculates end date based on `startDate + durationDays - 1`
- Updates in real-time as user changes dates or duration
- Prevents "Ongoing" display when duration is actively being set

##### Status Display Logic
**"MISSED" Badge** (RemindersPage.jsx):
- Shows "MISSED" if reminder is >2 hours past scheduled time
- **V10.18 FIX**: Skip time window check for dates before yesterday (they should be auto-completed as 'taken')
- Logic:
  ```javascript
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const isLocked = checkDate < yesterday;
  if (isLocked) {
      // Don't check time window, these are history
  } else {
      // Check 2-hour window for today/yesterday
  }
  ```

##### Key Date Comparison Rules
1. **Always use `en-CA` format**: `toLocaleDateString('en-CA')` returns `YYYY-MM-DD`
2. **String comparison**: `'2026-01-29' < '2026-02-03'` works correctly
3. **Time window**: Use `new Date()` for exact time comparisons
4. **Yesterday calculation**: 
   ```javascript
   const yesterday = new Date();
   yesterday.setDate(yesterday.getDate() - 1);
   yesterday.setHours(0, 0, 0, 0);
   ```

##### Common Pitfalls
1. ❌ **Don't** call `updateReminder()` with arbitrary updates during auto-complete
2. ❌ **Don't** use simple `id` for recurring reminders (use `uniqueId` or `${id}_${instanceKey}`)
3. ❌ **Don't** hard-delete recurring reminders with past history (use soft delete with `endDate`)
4. ✅ **Do** check `isLogsOnlyUpdate` before triggering series-splitting
5. ✅ **Do** preserve original end date when recalculating duration on split
6. ✅ **Do** auto-complete past instances for both new and split series

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
