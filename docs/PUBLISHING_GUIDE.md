# Play Store Publishing Guide (v1.3.11)

This guide provides everything you need to fill out the Google Play Console for **RemindMe Buddy**.

---

## 1. Main Store Listing
Copy these into the **Store presence > Main store listing** section.

**App Name:**
`RemindMe Buddy - Voice & Lists`

**Short Description (80 chars max):**
`Simple voice notes, checklists & reminders for family. Speak, Sync, and Share!`

**Full Description (4000 chars max):**
```text
RemindMe Buddy is the simplest way to manage your life. Designed for seniors, families, and busy individuals, it combines voice notes, checklists, and smart reminders into one easy-to-use app.

Key Features:
🎙️ Voice Notes: Just speak to save your thoughts. Perfect for quick ideas!
📝 Checklists & Lists: Organize groceries, tasks, and to-dos easily.
⏰ Reliable Alarms: Set pill reminders, appointments, or daily tasks that you won't miss.
🤝 Collaborative Sharing: Share notes and lists with family or caregivers in real-time.
🔒 Cloud Sync: Securely access your data from any device, anywhere.
🎨 Clean & Simple: Large text, high contrast, and a frustration-free interface.

Why choose RemindMe Buddy?
We believe technology should be helpful, not confusing. Whether it's managing health, staying in touch with family, or just organizing your day, RemindMe Buddy is your personal digital assistant.

Features included in v1.3.11:
- Real-time cloud sync with Firebase.
- Native Android notification channels for Alarms.
- Secure Gmail-based authentication.
- Shared notes with ownership-based permissions.

Download RemindMe Buddy and stay on top of what matters most!
```

---

## 2. App Content (Mandatory Disclosures)
Google Play requires you to answer these in the **Policy > App content** section.

### A. Privacy Policy
**URL:** `https://remindme-app-9988.web.app/privacy.html`
(I have hosted this for you on your Firebase project site).

### B. Data Safety
When asked about what data you collect:
- **Email Address:** Yes (Collected for authentication).
- **Audio Files:** Yes (Stored for voice notes functionality).
- **Files/Docs:** Yes (If you add attachments).
- **Is data encrypted in transit?** Yes (Firebase uses HTTPS/SSL).
- **Can users request data deletion?** Yes.

### C. Permissions
- **Record Audio:** Used for Voice Notes.
- **Notifications:** Used for Reminders & Alarms.
- **Exact Alarms:** Used for time-critical medication reminders.

---

## 3. How to Release (The Technical Part)
1.  **Go to Production**: On the left menu, select **Release > Production**.
2.  **Create New Release**:
    - **App Bundles**: Upload the file at `android/app/build/outputs/bundle/release/app-release.aab`.
    - **Release Name**: `1.3.11`
    - **Release Notes**:
      ```text
      - Critical fix for notification alarms on Android.
      - Improved note sharing permissions.
      - Robust cloud sync for offline edits.
      - Performance and UI refinements.
      ```
3.  **Review & Rollout**: Click **Review release** → **Start rollout to Production**.

---

**Tip:** If you need help hosting the Privacy Policy on your website, let me know!
