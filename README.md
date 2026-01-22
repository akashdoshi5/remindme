# RemindMe 🔔
**Your Intelligent Companion for Health & Daily Tasks**

RemindMe is a modern, accessible web application designed to help users—especially older adults—manage their daily schedules, medications, and memories with ease.

---

## 🌟 Key Features

### 1. Smart Reminders & Medications
*   **Complex Scheduling:**
    *   **Multiple Times:** Set up to 3 separate times per reminder (e.g., Morning, Afternoon, Evening).
    *   **Custom Days:** Choose specific days (Mon, Wed, Fri) or presets (Everyday, Weekends).
    *   **Courses:** Set specific durations for medications (e.g., "Antibiotics for 7 days").
*   **Action Window:**
    *   "Take" or "Mark Done" is only enabled within a **2-hour window** of the scheduled time to ensure accurate adherence tracking.
    *   Outside this window, reminders are automatically marked as "Missed", but can be managed manually in Reports.
*   **Deletion Control:**
    *   **Series vs. Single:** Smartly choose to delete just one instance (e.g., "Skip today's dose") or the entire recurring schedule.

### 2. Powerful Note Taking
*   **Voice-First:** Record audio notes easily with a single tap.
*   **Rich Attachments:** Add images and files (up to 5MB) to any note.
*   **Smart Conversion:** One-click **"Convert to Reminder"** button turns any note into a scheduler reminder instantly, pre-filling the text.
*   **Search Integration:** Global search finds content inside your notes and highlights exact matches.

### 3. Comprehensive Reports
*   **Adherence Tracking:** View your compliance score (%) to see how well you're sticking to your schedule.
*   **History Editing:**
    *   Forgot to mark a med yesterday? Go to the **Reports Tab** to view past days.
    *   Manually override status (mark "Taken" or "Missed") for past events to keep records accurate.

### 4. Accessibility & Design
*   **Large, Clear UI:** High-contrast text and large buttons for easy readability.
*   **Dark Mode:** Fully supported system-wide dark theme.
*   **Mobile Optimized:** Features a sliding drawer menu and bottom navigation for easy one-handed use.

---

## 🚀 How to Use

### Creating a Complex Reminder
1.  Tap **"Add Reminder"**.
2.  Enter Title (e.g., "Heart & BP Meds").
3.  Select **Frequency** -> "Daily" or "Custom".
4.  Toggle **"Multiple Times"** to add Morning (8:00 AM) and Evening (8:00 PM).
5.  Click **Save**. You will see two separate entries for each day.

### Converting a Note
1.  Go to **Notes**.
2.  Tap **"Add Note"** and record a voice memo like "Doctor appointment next Tuesday".
3.  Save the note.
4.  Open the note and click **"Convert to Reminder"**.
5.  Set the date/time and Save. The audio is now linked to your calendar!

### Checking Reports
1.  Navigate to the **Reports** tab.
2.  You will see an **Adherence Score** at the top.
3.  Scroll down to see history.
4.  Tap `Previous Days` to look back.
5.  Click the **Pencil Icon** on any past item to correct its status.

---

## 🛠 Tech Stack
*   **React + Vite** (Frontend)
*   **Firebase Firestore** (Database)
*   **Firebase Storage** (File/Audio Attachments)
*   **Tailwind CSS** (Styling)

---
*Built with ❤️ for a safer, more organized life.*
