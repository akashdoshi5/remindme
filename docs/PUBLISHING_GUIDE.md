# Play Store Publishing Guide (v1.3.14)

This guide provides everything you need to fill out the Google Play Console for **RemindMe**.

---

### 📁 Asset Folder
All required graphics are located in: `docs/play_store_assets/`

**Tip:** If you are looking for an image you previously uploaded or generated, they are all organized in this folder.

**Store Graphics:**
- `app_icon_512.png`: 512x512 Main Icon (Clock & Bell).
- `feature_graphic_1024x500.png`: Feature Graphic with seamless background.

**App Screenshots (Professional Framed Mockups):**
*Upload at least 4 of these under "Phone Screenshots":*
1. `mockup_1_home.png`: Home Dashboard - "Your Daily Health Dashboard"
2. `mockup_2_reminders.png`: Reminders - "Never Miss a Medication"
3. `mockup_3_settings.png`: Settings - "Private & Personal Settings"
4. `mockup_4_notes.png`: Notes - "Shared Notes & Family Lists"
5. `mockup_5_search.png`: Search - "Search Attachments & Voice"
6. `mockup_6_features.png`: Features - "Powerful Features for Modern Care"
7. `mockup_7_reports.png`: Reports - "Track Adherence & Progress"
8. `mockup_8_caregivers.png`: Caregivers - "Coordinate Care with Family"
9. `mockup_9_complex_schedule.png`: Add Reminder - "Complex Schedules Made Easy"

---

## 1. Main Store Listing (English)
Copy these into the **Store presence > Main store listing** section.

**App Name:**
`RemindMe: Smart Care & Records`

**Short Description (80 chars max):**
`One stop for health records, family care, smart reminders & voice notes.`

**Full Description (4000 chars max):**
`RemindMe: Smart Care & Records is your all-in-one assistant for organized family living and health management. Designed with simplicity and privacy in mind, it helps you stay on top of daily tasks while maintaining a secure digital archive of your most important records.

Key Features:
- 🔍 Advanced Search: Instantly find content inside your notes, attachments, or specific date ranges.
- 📅 Smart Reminders & Checklists: Set recurring alarms for medications, appointments, or simple daily habits.
- 📝 Checklists & Lists: Organize groceries, tasks, and to-dos easily.
- ⏰ Reliable Alarms: Set pill reminders, appointments, or daily tasks that you won't miss.
- 🤝 Collaborative Sharing: Shared notes allow family members to collaborate on grocery lists, care plans, or household tasks with granular permissions.
- 🔒 Cloud Sync: Securely access your data from any device, anywhere.
- 🎨 Clean & Simple: Large text, high contrast, and a frustration-free interface.
- 🎙️ Voice Notes: Just speak to save your thoughts. Perfect for quick ideas!

Experience a more disciplined and organized lifestyle with RemindMe: Smart Care & Records.`

---

## 2. Global Store Presence (Translations)
You can add these translations in **Store presence > Main store listing > Manage translations**.

### Hindi (hi-IN)
**App Name:** `RemindMe: स्मार्ट केयर और रिकॉर्ड`
**Short Description:** `स्वास्थ्य रिकॉर्ड, परिवार देखभाल, स्मार्ट रिमाइंडर और वॉयस नोट्स के लिए एक जगह`
**Full Description:**
```text
RemindMe आपके जीवन को व्यवस्थित करने का सबसे आसान तरीका है। विशेष रूप से वरिष्ठ नागरिकों और परिवारों के लिए डिज़ाइन किया गया।

मुख्य विशेषताएं:
🎙️ आवाज़ नोट: बस बोलें और अपनी यादें सुरक्षित करें।
📝 चेकलिस्ट: किराने की सूची और कार्यों को आसानी से व्यवस्थित करें।
⏰ अलार्म: दवा के रिमाइंडर और महत्वपूर्ण नियुक्तियों को कभी न भूलें।
🤝 साझा करना: परिवार के साथ रीयल-टाइम में नोट्स साझा करें।
🌍 बहुभाषी: अंग्रेजी, हिंदी और मराठी का समर्थन।
```

### Marathi (mr-IN)
**App Name:** `RemindMe: स्मार्ट केअर आणि रेकॉर्ड्स`
**Short Description:** `आरोग्य रेकॉर्ड, फॅमिली केअर, स्मार्ट रिमाइंडर आणि व्हॉइस नोट्ससाठी एक थांबा`
**Full Description:**
```text
RemindMe आपल्या जीवनाचे नियोजन करण्याचा सर्वात सोपा मार्ग आहे। ज्येष्ठ नागरिक आणि कुटुंबांसाठी बनविलेले।

ठळक वैशिष्ट्ये:
🎙️ आवाज नोट: फक्त बोला आणि आपल्या नोंदी सुरक्षित करा।
📝 चेकलिस्ट: किराणा मालाची यादी आणि कामे सहजपणे व्यवस्थापित करा।
⏰ अलार्म: औषधांचे रिमाइंडर आणि महत्त्वाची कामे कधीही विसरू नका।
🤝 शेअरिंग: कुटुंबासोबत रीयल-टाइममध्ये नोट्स शेअर करा।
🌍 बहुभाषिक: इंग्रजी, हिंदी आणि मराठी सपोर्ट।
```

---

## 3. App Content (Mandatory Disclosures)
Google Play requires you to answer these in the **Policy > App content** section.

### A. Privacy Policy
**URL:** `https://remindme-app-9988.web.app/privacy.html`

**Account Deletion URL:** `https://remindme-app-9988.web.app/privacy.html#deletion`

### B. Data Safety
- **Email Address:** Yes (For auth).
- **Audio Files:** Yes (For voice notes).
- **Files/Docs:** Yes (For attachments).
- **Encryption:** Yes (HTTPS/SSL).
- **Deletion:** Yes.

---

## 4. How to Release (v1.3.14)
1.  **Generate AAB**: Run the `scripts/build-release.ps1` script.
2.  **Go to Production**: In Play Console, select **Release > Production**.
3.  **Create New Release**:
    - **App Bundles**: Upload `android/app/build/outputs/bundle/release/app-release.aab`.
    - **Release Name**: `1.3.14`
    - **Release Notes**:
      ```text
      - Fixed recurring schedules (Weekly, Monthly, and Custom days now work correctly).
      - Added daily reset for "Every X Hours" reminders to align with wake windows.
      - Enforced strict meal time validation (Breakfast, Lunch, Dinner).
      - Fixed Time Input visibility bugs in the Add Reminder modal.
      - Added Hindi and Marathi translations for the Help Guide.
      - Performance and stability improvements.
      ```
4.  **Review & Rollout**: Click **Review release** → **Start rollout (100%)**.

---

## 🛠️ Future Improvements / Optimization
- **[ ] R8 Deobfuscation Mapping**: To get readable crash reports in the Play Console, we should eventually upload the `mapping.txt` file generated during builds.
  - **Location**: `android/app/build/outputs/mapping/release/mapping.txt`
  - **Action**: Upload this to the Play Console under **Bundle Details** for each release to turn obfuscated stack traces back into readable code.

