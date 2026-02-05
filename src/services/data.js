// Simple in-memory store for the session (and local storage persistence)
import { auth } from './firebase';
import { firestoreService } from './firestoreService';

const BASE_STORAGE_KEY = 'remindme_buddy_db';
let currentUserId = null;

const getStorageKey = () => currentUserId ? `${BASE_STORAGE_KEY}_${currentUserId}` : `${BASE_STORAGE_KEY}_guest`;

const defaultData = {
    reminders: [],
    notes: [],
    caregivers: [],
    history: [],
    settings: {
        sleepStart: '22:00',
        sleepEnd: '08:00',
        theme: 'system'
    }
};

const loadStore = () => {
    try {
        const key = getStorageKey();
        const local = localStorage.getItem(key);
        return local ? JSON.parse(local) : JSON.parse(JSON.stringify(defaultData));
    } catch (e) {
        console.error("Failed to load store", e);
        return JSON.parse(JSON.stringify(defaultData));
    }
};

const notifyListeners = () => {
    window.dispatchEvent(new Event('storage-update'));
};

// Initialize from storage or default
let store = loadStore();

// CAREGIVER / PROFILE STATE
let activeProfile = null; // null = mine, { uid, name, email } = patient
let patientData = { reminders: [], notes: [], history: [] }; // Read-only cache for viewed patient
let patientUnsubscribe = null;

// SYNC LISTENERS (V6)
let syncUnsubscribes = []; // Array of unsubscribe functions for current user

const getCurrentStore = () => activeProfile ? patientData : store;

const save = () => {
    if (activeProfile) return; // Do not save patient data to my local storage
    localStorage.setItem(getStorageKey(), JSON.stringify(store));
    notifyListeners();
};

export const dataService = {
    // ACCOUNT SWITCHING
    setUserId: async (uid) => {
        if (currentUserId === uid) return; // No change

        // 1. Auto-Migration from Guest (if applicable)
        if (!currentUserId && uid) {
            const guestKey = `${BASE_STORAGE_KEY}_guest`;
            const guestDataStr = localStorage.getItem(guestKey);
            if (guestDataStr) {
                try {
                    const guestData = JSON.parse(guestDataStr);
                    const hasData = (guestData.reminders?.length > 0) || (guestData.notes?.length > 0);
                    if (hasData) {
                        console.log("Found guest data. Migrating to:", uid);
                        await firestoreService.migrateLocalData(guestData);
                        console.log("Guest migration successful. Clearing guest storage.");
                        localStorage.removeItem(guestKey);
                    }
                } catch (e) {
                    console.error("Error migrating guest data", e);
                }
            }
        }

        // 2. Switch User
        currentUserId = uid;
        activeProfile = null; // Reset profile view on login
        if (patientUnsubscribe) {
            patientUnsubscribe();
            patientUnsubscribe = null;
        }

        // Cleanup old listeners
        syncUnsubscribes.forEach(unsub => unsub());
        syncUnsubscribes = [];

        store = loadStore(); // Load whatever local data exists for this user

        // 3. Sync-Up Check & Realtime Listeners
        if (uid) {
            // A. Initial Migration (Push local to cloud if needed)
            if ((store.reminders && store.reminders.length > 0) || (store.notes && store.notes.length > 0)) {
                console.log("Authenticated User: Syncing local cache to Cloud...");
                firestoreService.migrateLocalData(store).catch(e => console.error("Sync-up failed", e));
            }

            // B. Setup Realtime Listeners (Pull cloud to local)
            console.log("Setting up Realtime Sync for:", uid);

            // Reminders Listener
            const unsubReminders = firestoreService.getRemindersRealtime((reminders) => {
                store.reminders = reminders;
                save(); // Persist to local storage
            });
            syncUnsubscribes.push(unsubReminders);

            // Notes Listener (Owned)
            const unsubNotes = firestoreService.getNotesRealtime((notes) => {
                // Preserve existing SHARED notes when owned notes update
                const currentShared = store.notes.filter(n => n.isShared);

                // Combine new OWNED with existing SHARED
                // Filter out any owned notes that might be in currentShared (unlikely but safe)
                const sharedMap = new Map(currentShared.map(n => [n.id, n]));

                // If an owned note is also in sharedMap, we prefer the OWNED version (latest from this listener)
                // Actually, sharedMap only contains isShared=true.
                // Just concat.
                store.notes = [...notes, ...Array.from(sharedMap.values())];

                // Sort by createdAt descending
                store.notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                save();
            });
            syncUnsubscribes.push(unsubNotes);

            // Shared Notes Listener
            const unsubShared = firestoreService.getSharedNotesRealtime((sharedNotes) => {
                // Merge Shared into Store
                // We need to avoid duplicates if a note is both owned and shared (unlikely).
                // We also need to avoid overwriting owned notes when shared update comes.
                // current store.notes has OWNED notes (from above).
                // We should append SHARED notes.
                const owned = store.notes.filter(n => !n.isShared);

                // Deduplicate by ID just in case
                const sharedMap = new Map(sharedNotes.map(n => [n.id, n]));
                owned.forEach(n => {
                    if (sharedMap.has(n.id)) sharedMap.delete(n.id); // Prefer owned version if conflict?
                });

                store.notes = [...owned, ...Array.from(sharedMap.values())];

                // Sort by date or order?
                store.notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                save();
            });
            syncUnsubscribes.push(unsubShared);

            // Settings Listener
            const unsubSettings = firestoreService.getSettingsRealtime((settings) => {
                if (settings) {
                    store.settings = { ...store.settings, ...settings };
                    save();
                }
            });
            syncUnsubscribes.push(unsubSettings);
        }

        notifyListeners();
    },

    // PROFILE MANAGEMENT (Caregiver Mode)
    setActiveProfile: async (profile) => {
        // If switching to self (null)
        if (!profile) {
            if (patientUnsubscribe) patientUnsubscribe();
            activeProfile = null;
            patientData = { reminders: [], notes: [], history: [] };
            notifyListeners();
            return;
        }

        // Switching to Patient
        activeProfile = profile;
        patientData = { reminders: [], notes: [], history: [] }; // Reset

        // Subscribe to Patient Data
        if (patientUnsubscribe) patientUnsubscribe();
        patientUnsubscribe = firestoreService.getPatientRemindersRealtime(profile.uid, (reminders) => {
            patientData.reminders = reminders;
            notifyListeners();
        });

        notifyListeners();
    },

    getActiveProfile: () => activeProfile,
    isReadOnly: () => !!activeProfile, // Exposed helper for UI

    // Caregiver Actions
    // addCaregiver: (Moved to bottom)


    getPatientsForMe: async () => {
        if (!auth.currentUser) return [];
        return await firestoreService.getPatientsForCaregiver(auth.currentUser.email);
    },

    // SYNC: Update local store from Cloud (acting as cache)
    syncFromCloud: (type, data) => {
        if (activeProfile) return; // Don't sync when viewing patient

        if (type === 'reminders') {
            // V10.20: SMART MERGE to prevent overwriting pending local changes (logs)
            if (!store.reminders) store.reminders = [];

            store.reminders = data.map(cloudR => {
                const localR = store.reminders.find(r => String(r.id) === String(cloudR.id));

                // If we have a local version, merge critical fields that might have pending writes
                if (localR) {
                    // Merge Logs: Keep local logs if cloud is missing them (pending sync)
                    const mergedLogs = { ...cloudR.logs };
                    if (localR.logs) {
                        Object.keys(localR.logs).forEach(key => {
                            // If local has a log that cloud doesn't, OR local has a timestamp? 
                            // Simple heuristic: If cloud is empty/missing for this key, use local.
                            if (!mergedLogs[key]) {
                                mergedLogs[key] = localR.logs[key];
                            }
                        });
                    }

                    // Note: For 'status' (single instance), we generally trust Cloud as source of truth
                    // because Firestore SDK handles latency compensation (local writes appear in snapshot instantly).
                    // The main risk was blind overwriting references or partial log updates.

                    return { ...cloudR, logs: mergedLogs };
                }
                return cloudR;
            });
        }
        else if (type === 'notes') store.notes = data;
        else if (type === 'caregivers') store.caregivers = data;

        if (type === 'settings') {
            store.settings = { ...(store.settings || {}), ...data };
        }

        // Save to local storage for offline use / persistence
        save();

        // Trigger UI update
        notifyListeners();
    },

    // Export store access for migration
    getLocalStore: () => store,

    // Reminders
    getReminders: () => [...(getCurrentStore().reminders || [])],

    isReminderDone: (id, instanceKey) => {
        const r = (getCurrentStore().reminders || []).find(i => String(i.id) === String(id));
        if (!r) return true; // If not found, assume complete to avoid errors

        const log = (r.logs || {})[instanceKey];
        if (!log) return false; // Not acted upon

        if (log.status === 'taken') return true;
        if (log.status === 'missed') return true; // Don't ring for missed
        if (log.status === 'snoozed') {
            // If snoozed, check if we are still within snooze window
            if (log.snoozedUntil) {
                const now = new Date();

                // FIX: Support ISO Timestamp for robust sync (Primary)
                if (log.snoozedUntil.includes('T')) {
                    return now < new Date(log.snoozedUntil);
                }

                // Legacy Fallback (HH:MM)
                const current = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                return current < log.snoozedUntil;
            }
            return true;
        }
        return false;
    },

    // NEW: Get expanded view for a specific day
    // NEW: Generic Expansion Logic (Pure Function)
    expandRemindersForDate: (dateString, sourceReminders, settings = {}) => {
        // dateString is YYYY-MM-DD
        const all = sourceReminders || [];
        const expanded = [];

        // Defaults
        const sleepStart = settings.sleepStart || '22:00';
        const sleepEnd = settings.sleepEnd || '08:00';

        // Helper for reliable date comparison (local strings)
        const getHealthDiffDays = (startStr, currentStr) => {
            const start = new Date(startStr);
            const current = new Date(currentStr);
            const diffTime = current - start;
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        };

        // Determine current time context for status checks
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentDay = String(now.getDate()).padStart(2, '0');
        const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;

        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeMinutes = currentHour * 60 + currentMinute;

        all.forEach(r => {
            // Universal Start Date & Duration Logic
            // This applies to ALL reminders (Medication, Water, etc) to ensure calendar mapping is correct.
            const univSchedule = r.schedule || {};
            const univStart = univSchedule.startDate || r.date || '2000-01-01';

            // 1. Global Start Date Check
            if (dateString < univStart) return;

            // 2. Global Duration Check
            if (univSchedule.durationDays) {
                const start = new Date(univStart);
                const current = new Date(dateString);
                const diffInTime = current - start;
                const diffInDays = Math.ceil(diffInTime / (1000 * 60 * 60 * 24));

                // If diffDays is negative (before start), cleared by check #1, but strictly:
                if (diffInDays < 0) return;
                // If exceeded duration
                if (diffInDays >= univSchedule.durationDays) return;
            }
            // Check End Date (Soft Delete / Expiry)
            if (univSchedule.endDate) {
                if (dateString > univSchedule.endDate) return;
            }

            // 1. Handle Complex Schedules (Medication)
            if (r.schedule && r.schedule.type === 'recurring') {
                // strict check against start date
                const startStr = r.schedule.startDate; // YYYY-MM-DD

                // If dateString is BEFORE start date, ignore
                if (dateString < startStr) return;

                const diffDays = getHealthDiffDays(startStr, dateString);

                // Check duration
                if (diffDays >= 0 && (r.schedule.durationDays ? diffDays < r.schedule.durationDays : true)) {
                    // Generate instances for this day
                    const times = r.schedule.times || {};
                    Object.entries(times).forEach(([period, time]) => {
                        if (!r.schedule.frequency.includes(period)) return;

                        const instanceKey = `${dateString}_${period}`;
                        const log = (r.logs || {})[instanceKey];
                        const exception = (r.exceptions || {})[instanceKey];

                        // Exception: Cancelled/Hidden
                        if (exception && exception.status === 'cancelled') return;

                        // Calculate Effective Time & Check Status
                        // FIX: Handle ISO Snooze Time for correct status (even if snoozed to next day)
                        // FIX: Prefer Exception Time if user manually edited "This Instance Only"
                        let displayTime = exception?.time || time; // Use exception time if exists
                        let checkDateTime = new Date(dateString);
                        // Default to scheduled time
                        if (displayTime && displayTime.includes(':')) {
                            const [th, tm] = displayTime.split(':').map(Number);
                            checkDateTime.setHours(th, tm, 0, 0);
                        }

                        if (log && log.snoozedUntil && log.status === 'snoozed') {
                            if (log.snoozedUntil.includes('T')) {
                                // ISO Format (New)
                                checkDateTime = new Date(log.snoozedUntil); // Absolute time
                                // Update display time to HH:MM for UI
                                displayTime = checkDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                            } else {
                                // Legacy Format
                                displayTime = log.snoozedUntil;
                                const [sth, stm] = displayTime.split(':').map(Number);
                                checkDateTime.setHours(sth, stm, 0, 0);
                            }
                        }

                        // STRICT STATUS LOGIC
                        let status = 'upcoming'; // Default
                        const now = new Date();
                        // checkDateTime already set above

                        const twoHoursMs = 2 * 60 * 60 * 1000;
                        const diff = now.getTime() - checkDateTime.getTime();

                        if (log && log.status === 'taken') {
                            status = 'taken';
                        } else if (log && log.status === 'missed') {
                            status = 'missed';
                        } else if (log && log.status === 'snoozed' && diff < twoHoursMs) {
                            status = 'snoozed';
                        } else if (diff > twoHoursMs) {
                            // If passed window and not logged as taken, it is MISSED.
                            // This covers past days (diff huge) and earlier today (diff > 2h).
                            status = 'missed';
                        } else {
                            status = 'upcoming';
                        }

                        expanded.push({
                            ...r,
                            ...exception, // OVERRIDE with exception data (instructions, files, etc)
                            uniqueId: `${r.id}_${instanceKey}`,
                            instanceKey: instanceKey,
                            // FIX: Ensure 'time' property reflects the override for the UI list
                            time: displayTime,
                            originalTime: time,
                            displayTime: displayTime, // Potentially snoozed/overridden time
                            period: period,
                            status: status,
                            takenAt: log ? log.takenAt : null,
                            isVirtual: true,
                            originalStatus: log ? log.status : 'upcoming', // Keep track if needed
                            targetDate: dateString // EXPLICIT TARGET DATE for scheduling
                        });
                    });
                }
            }
            // 2. Handle Simple/Legacy Reminders (including new Intervals)
            else {
                if (r.frequency?.startsWith('Every')) {
                    // Hourly / Interval Logic
                    // Format: "Every X Hours"
                    const intervalMatch = r.frequency.match(/Every (\d+) Hour/);
                    if (intervalMatch) {
                        const intervalHours = parseInt(intervalMatch[1]);

                        // Parse Start/End times (Default 8am - 10pm if missing)
                        const startHour = r.startTime ? parseInt(r.startTime.split(':')[0]) : 8;
                        const endHour = r.endTime ? parseInt(r.endTime.split(':')[0]) : 22;

                        // Create instances
                        let currentH = startHour;
                        while (currentH < endHour) {
                            const timeStr = `${String(currentH).padStart(2, '0')}:00`;
                            // Standardize Key (V5.5 Match Writer)
                            let instanceKey = `${dateString}_time_${timeStr}`;

                            // Check for Exception Override
                            // Writer (AddReminderModal) saves keys as `${date}_time_${time}` or `${date}_${time}`
                            // We should check both to be robust.
                            const altKey = `${dateString}_${timeStr}`;

                            const log = (r.logs || {})[instanceKey] || (r.logs || {})[altKey];
                            const exception = (r.exceptions || {})[instanceKey] || (r.exceptions || {})[altKey];

                            if (exception && exception.status === 'cancelled') {
                                currentH += intervalHours;
                                continue;
                            }

                            // Determine Display Time (Override if exception has time)
                            let displayTime = exception?.time || timeStr;

                            // Status Check
                            let status = 'upcoming';
                            let checkTime = displayTime;

                            // Parse checkTime for status logic
                            const [ch, cm] = checkTime.split(':').map(Number);
                            const iDate = new Date(dateString);
                            iDate.setHours(ch, cm, 0, 0);

                            if (log) status = log.status;
                            else if (exception && exception.status) status = exception.status;
                            else if (iDate < now) status = 'missed'; // Auto miss if past

                            expanded.push({
                                ...r,
                                ...exception, // Merge exception data (instructions, etc)
                                files: (exception && exception.files && exception.files.length > 0) ? exception.files : (r.files || []),
                                uniqueId: `${r.id}_${instanceKey}`,
                                instanceKey: exception ? (r.exceptions[instanceKey] ? instanceKey : altKey) : instanceKey,
                                displayTime: displayTime,
                                status,
                                isInterval: true,
                                targetDate: dateString,
                                time: displayTime // Ensure UI sees the updated time
                            });

                            currentH += intervalHours;
                        }
                        return; // Done with this reminder
                    }
                }

                // 2. Standard Frequencies (Daily, Weekly, etc)
                let show = false;
                if (r.frequency && r.frequency.startsWith('Every')) show = true; // Always show interval items (filtered by date start/end globally)
                else if (r.frequency === 'Daily') show = true;
                else if (r.frequency === 'Today') show = (r.date === dateString || (!r.date && dateString === todayStr));
                else if (r.date === dateString) show = true;
                else if (r.frequency === 'Monthly') {
                    // Monthly Logic: Same day of month
                    const start = new Date(r.schedule?.startDate || r.date || '2000-01-01');
                    const current = new Date(dateString);
                    // Check if day matches
                    if (start.getDate() === current.getDate()) {
                        show = true;

                        // Handle short months (e.g. 31st on Feb) -> Skip? Or fallback to last day?
                        // Standard behavior: Skip if date doesn't exist in current month.
                        // JS Date auto-corrects (Jan 31 + 1 month -> March 3) which is bad for recurrence.
                        // But here we are iterating DAYS. `dateString` is valid. 
                        // We check if `dateString`'s day matches `start`'s day.
                        // If Start is 31st, and dateString is Feb 28, they don't match. So it skips.
                        // User wants simple monthly.
                    }
                }
                else if (r.frequency === 'Weekly') {
                    // Calculate day difference from start
                    const start = new Date(r.schedule?.startDate || r.date || '2000-01-01');
                    const current = new Date(dateString);
                    // Reset hours to avoid timezone/time diff issues
                    start.setHours(0, 0, 0, 0);
                    current.setHours(0, 0, 0, 0);

                    const diffTime = current - start;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    // Show if diffDays is non-negative and divisible by 7
                    if (diffDays >= 0 && diffDays % 7 === 0) show = true;
                } else if (r.frequency && (r.frequency.includes(',') || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].some(d => r.frequency.includes(d)))) {
                    // Custom Days
                    const dayName = new Date(dateString).toLocaleDateString('en-US', { weekday: 'short' });
                    if (r.frequency.includes(dayName)) show = true;
                }

                // Also check start date if it exists for daily? 
                const globalStart = r.schedule?.startDate || r.date;
                if (globalStart && dateString < globalStart) show = false;

                if (show) {
                    // Determine Times (Single vs Interval)
                    let times = [];

                    if (r.frequency && r.frequency.startsWith('Every')) {
                        // Interval Logic
                        // Robust Parsing: Handle "Every 2 Hours", "Every 2h", "Every 2h "
                        const match = r.frequency.match(/Every\s+(\d+)\s*(h|hour|hours)?/i);
                        const intervalHours = match ? parseInt(match[1]) : NaN;

                        if (!isNaN(intervalHours)) {
                            let startH, startM;
                            const startDateStr = r.schedule?.startDate || r.date;

                            if (r.time && startDateStr === dateString) {
                                [startH, startM] = r.time.split(':').map(Number);
                            } else {
                                [startH, startM] = sleepEnd.split(':').map(Number);
                            }

                            const [limitH, limitM] = sleepStart.split(':').map(Number);
                            let limitMinutes = limitH * 60 + limitM;
                            let currentMinutes = startH * 60 + startM;

                            // Handle crossing midnight: if sleepStart < sleepEnd/current (e.g. 02:00 < 22:00)
                            // If limit is earlier than start, assume it means the next day (crossing midnight)
                            // This handles "Start 10 PM, Sleep 2 AM" AND "Start 3 PM, Sleep 10 AM (night shift?)"
                            if (limitMinutes < currentMinutes) {
                                limitMinutes += 24 * 60;
                            }

                            // Safety cap: Don't generate more than 24 hours of intervals to prevent infinite loops or huge lists
                            // If the user sets "Every 1 Hour" and window is > 24h (rare but possible with logic above), cap it.
                            if (limitMinutes - currentMinutes > 24 * 60) {
                                limitMinutes = currentMinutes + 24 * 60;
                            }

                            const step = intervalHours * 60;
                            if (step > 0) {
                                while (currentMinutes <= limitMinutes) {
                                    const h = Math.floor(currentMinutes / 60);
                                    const m = currentMinutes % 60;
                                    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                    times.push(timeStr);
                                    currentMinutes += step;
                                }

                                // Fallback: If Today and user set a time LATER than sleep window (e.g. 11pm), obey them.
                                if (times.length === 0 && startDateStr === dateString && r.time) {
                                    times.push(r.time);
                                }
                            }
                        }
                    } else {
                        times.push(r.time);
                    }

                    // Process natural instances
                    times.forEach(time => {
                        // CRITICAL FIX V5.4: Key Format Standardization
                        // Debug logs showed keys like '2026-02-01_time_20:00'. 
                        // Previous code generated '2026-02-01_20:00'.
                        // We must check BOTH to be safe, or standardize execution.
                        let instanceKey = `${dateString}_${time || 'default'}`;
                        const legacyKey = `${dateString}_time_${time || 'default'}`;

                        let log = (r.logs || {})[instanceKey] || (r.logs || {})[legacyKey];
                        let exception = (r.exceptions || {})[instanceKey] || (r.exceptions || {})[legacyKey];

                        // Normalize key for future use in this loop
                        if ((r.logs || {})[legacyKey] || (r.exceptions || {})[legacyKey]) {
                            instanceKey = legacyKey;
                        }

                        if (exception && exception.status === 'cancelled') return;

                        // CRITICAL FIX: If exception moves date AWAY from today, skip it.
                        if (exception && exception.date && exception.date !== dateString) return;

                        let displayTime = exception?.time || time;
                        let checkDateTime = new Date(dateString);

                        if (displayTime) {
                            const [th, tm] = displayTime.split(':').map(Number);
                            checkDateTime.setHours(th, tm, 0, 0);
                        } else {
                            checkDateTime.setHours(23, 59, 0, 0);
                        }

                        if (log && log.snoozedUntil && log.status === 'snoozed') {
                            if (log.snoozedUntil.includes('T')) {
                                checkDateTime = new Date(log.snoozedUntil);
                                displayTime = checkDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                            } else {
                                displayTime = log.snoozedUntil;
                                const [sth, stm] = displayTime.split(':').map(Number);
                                checkDateTime.setHours(sth, stm, 0, 0);
                            }
                        }

                        // ... Status Logic ...
                        let status = 'upcoming';
                        const now = new Date();

                        // Recalculate diff/status similar to before...
                        const twoHoursMs = 2 * 60 * 60 * 1000;
                        const diff = now.getTime() - checkDateTime.getTime();

                        if (log && log.status === 'taken') status = 'taken';
                        else if (log && log.status === 'missed') status = 'missed';
                        else if (r.status === 'done' && !log && r.frequency === 'Once') status = 'taken';
                        else if (log && log.status === 'snoozed' && diff < twoHoursMs) status = 'snoozed'; // Allow snoozed active
                        else if (diff > twoHoursMs) status = 'missed';
                        else status = 'upcoming';

                        // Future safety
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dObj = new Date(dateString);
                        dObj.setHours(0, 0, 0, 0);
                        if (dObj > today && status === 'missed') status = 'upcoming';

                        expanded.push({
                            ...r,
                            ...exception, // OVERRIDE with exception data (instructions, files, etc)
                            files: (exception && exception.files && exception.files.length > 0) ? exception.files : (r.files || []),
                            uniqueId: `${r.id}_${instanceKey}`,
                            instanceKey: instanceKey,
                            displayTime: displayTime,
                            status: status,
                            takenAt: log ? log.takenAt : null,
                            isVirtual: true,
                            isMovedIn: false,
                            targetDate: dateString // EXPLICIT TARGET DATE
                        });
                    });
                }
            }

            // CRITICAL FIX Phase 2: Check for instances moved TO this date (from other dates)
            if (r.exceptions) {
                Object.entries(r.exceptions).forEach(([key, ex]) => {
                    if (ex.date === dateString) {
                        // This instance is moved TO today.
                        const alreadyExists = expanded.some(item => item.instanceKey === key);
                        if (alreadyExists) return;

                        // Add this moved-in instance
                        const log = (r.logs || {})[key];

                        let displayTime = ex.time; // Use exception time
                        let checkDateTime = new Date(dateString); // It is ON this date
                        if (displayTime) {
                            const [th, tm] = displayTime.split(':').map(Number);
                            checkDateTime.setHours(th, tm, 0, 0);
                        }

                        if (log && log.snoozedUntil && log.status === 'snoozed') {
                            if (log.snoozedUntil.includes('T')) {
                                checkDateTime = new Date(log.snoozedUntil);
                                displayTime = checkDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                            } else {
                                displayTime = log.snoozedUntil;
                                const [sth, stm] = displayTime.split(':').map(Number);
                                checkDateTime.setHours(sth, stm, 0, 0);
                            }
                        }

                        let status = 'upcoming';
                        const now = new Date();

                        const diff = now.getTime() - checkDateTime.getTime();
                        const twoHoursMs = 2 * 60 * 60 * 1000;

                        if (log && log.status === 'taken') status = 'taken';
                        else if (log && log.status === 'missed') status = 'missed';
                        else if (log && log.status === 'snoozed') status = 'snoozed'; // Snoozed moved item
                        else if (diff > twoHoursMs) status = 'missed';
                        else status = 'upcoming';

                        // Future safety
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dObj = new Date(dateString);
                        dObj.setHours(0, 0, 0, 0);
                        if (dObj > today && status === 'missed') status = 'upcoming';

                        expanded.push({
                            ...r,
                            ...ex, // Apply Exception Data (Title, Notes, etc)
                            files: (ex.files && ex.files.length > 0) ? ex.files : (r.files || []),
                            uniqueId: `${r.id}_${key}`,
                            instanceKey: key,
                            displayTime: displayTime,
                            status: status,
                            takenAt: log ? log.takenAt : null,
                            isVirtual: true,
                            isMovedIn: true,
                            targetDate: dateString // EXPLICIT TARGET DATE
                        });
                    }
                });
            }
        });

        // Sort by time
        return expanded.sort((a, b) => {
            if (!a.displayTime) return 1;
            if (!b.displayTime) return -1;
            return a.displayTime.localeCompare(b.displayTime);
        });
    },

    // NEW: Get expanded view for a specific day
    getRemindersForDate: (dateString) => {
        // Wrapper for internal store
        const store = getCurrentStore();
        return dataService.expandRemindersForDate(dateString, store.reminders, store.settings);
    },

    getUpcomingReminders: (days = 7) => {
        const allUpcoming = [];
        const today = new Date();
        console.log('📆 getUpcomingReminders(): Starting from', today.toLocaleDateString('en-CA'), 'for next', days, 'days');

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);

            // FIX: Manual formatting to guarantee YYYY-MM-DD (avoid Locale/WebView inconsistencies)
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            const reminders = dataService.getRemindersForDate(dateStr);
            console.log(`  Day ${i} (${dateStr}): Found ${reminders.length} total reminders`);

            // Filter only valid upcoming ones (not taken, not missed/past - unless snoozed active)
            const active = reminders.filter(r =>
                r.status === 'upcoming' || r.status === 'snoozed'
            );
            console.log(`  Day ${i} (${dateStr}): ${active.length} active (upcoming/snoozed) reminders`);
            allUpcoming.push(...active);
        }
        console.log('📆 getUpcomingReminders(): Returning', allUpcoming.length, 'total reminders');
        return allUpcoming;
    },

    addReminder: async (reminder) => {
        if (activeProfile) return; // Read Only

        let newReminder;
        if (auth.currentUser) {
            newReminder = await firestoreService.addReminder(reminder);
        } else {
            newReminder = { ...reminder, id: Date.now() };
            if (!store.reminders) store.reminders = [];
            store.reminders.push(newReminder);
            save();
        }

        // V10.8: Auto-Complete Past Instances Logic
        try {
            const now = new Date();
            const todayStr = now.toLocaleDateString('en-CA');
            const startStr = newReminder.schedule?.startDate || newReminder.date;

            // Only backfill if we have a start date and it is <= today
            if (startStr && startStr <= todayStr) {
                console.log("Checking for past instances to auto-complete...", startStr);
                const logs = {};
                let hasUpdates = false;

                // Limit backfill to 365 days to prevent crashes on crazy old dates
                const startDate = new Date(startStr);
                const loopDate = new Date(startStr);
                // Reset time to avoid loop issues
                loopDate.setHours(0, 0, 0, 0);

                const limitDate = new Date(todayStr);
                limitDate.setHours(0, 0, 0, 0);

                const oneDay = 24 * 60 * 60 * 1000;
                let iterations = 0;

                while (loopDate <= limitDate && iterations < 365) {
                    const dStr = loopDate.toLocaleDateString('en-CA');

                    // Use expandRemindersForDate with explicit single reminder to get correct instances
                    const instances = dataService.expandRemindersForDate(dStr, [newReminder], store.settings || {});

                    instances.forEach(inst => {
                        // Check exact time
                        let isPast = false;
                        if (dStr < todayStr) isPast = true;
                        else if (dStr === todayStr) {
                            // Check time
                            if (inst.time) {
                                const instanceDate = new Date(`${dStr}T${inst.time}`);
                                if (instanceDate < now) isPast = true;
                            } else {
                                // All day? Assume done? Or keep active? 
                                // User said "past reminders... considering u have taken".
                                // If today passed, it's done? If today is current, effectively "Time < Now" matters.
                                // If no time, standard is notification at specific time.
                                // Let's assume strict time comparison. If no time, treat as 'Now' (upcoming).
                            }
                        }

                        if (isPast) {
                            logs[inst.instanceKey] = {
                                status: 'taken', // V10.11 FIX: Must be 'taken' to match expandReminders status logic
                                takenAt: new Date().toISOString()
                            };
                            hasUpdates = true;
                        }
                    });

                    loopDate.setTime(loopDate.getTime() + oneDay);
                    iterations++;
                }

                if (hasUpdates) {
                    console.log("Auto-completing past instances:", Object.keys(logs).length);
                    // Update the reminder
                    // NOTE: updateReminder merges logs
                    await dataService.updateReminder(newReminder.id, { logs });

                    // Update returned object locally just in case UI uses it immediately without refetch
                    newReminder.logs = { ...newReminder.logs, ...logs };
                }
            }
        } catch (err) {
            console.error("Auto-completion failed", err);
            // Non-blocking error
        }

        return newReminder;
    },

    updateReminder: async (id, updates, instanceKey = null) => {
        if (activeProfile) return; // Read Only
        if (!store.reminders) store.reminders = [];

        const reminder = store.reminders.find(r => String(r.id) === String(id));
        if (!reminder) return;

        if (instanceKey) {
            // DETACH LOGIC: If Date is changed, verify if we should detach from series
            // Check if 'date' is present in updates and differs from the instanceKey date
            const originalDate = instanceKey.split('_')[0];
            if (updates.date && updates.date !== originalDate) {
                console.log("DataService: Date changed for instance. Detaching...", instanceKey, "to", updates.date);

                // 1. Cancel the original instance in the series
                // We recursively call updateReminder with just status='cancelled' for the OLD instanceKey
                // This ensures the series timeline hides the old one.
                await dataService.updateReminder(id, { status: 'cancelled' }, instanceKey);

                // 2. Create a NEW Single Reminder for the new date
                const newId = String(Date.now());

                // Clean up the update payload to be a proper Single Reminder
                const newReminder = {
                    ...reminder, // Copy original series props (title, type, etc)
                    ...updates,  // Apply changes (new date, new time, etc)
                    id: newId,
                    frequency: 'Once', // Force Single
                    schedule: null,     // Remove Series Schedule
                    date: updates.date, // Ensure top-level date is set
                    // Ensure time is set correctly from updates or original instance
                    time: updates.time || updates.schedule?.startTime || reminder.time || '09:00',

                    // Reset Series-specifics
                    logs: {},
                    exceptions: {},
                    instanceKey: null,
                    isVirtual: false
                };

                // Remove internal props that shouldn't be copied
                delete newReminder.period;
                delete newReminder.displayTime;
                delete newReminder.uniqueId;

                console.log("DataService: Creating detached reminder:", newReminder);
                await dataService.addReminder(newReminder);
                return;
            }

            console.log("DataService: Creating Exception:", instanceKey, updates);
            // Create Exception Logic (local)
            store.reminders = store.reminders.map(r => {
                if (String(r.id) === String(id)) {
                    const exceptions = r.exceptions ? JSON.parse(JSON.stringify(r.exceptions)) : {};
                    exceptions[instanceKey] = {
                        ...(exceptions[instanceKey] || {}),
                        ...updates,
                        isException: true
                    };
                    return { ...r, exceptions };
                }
                return r;
            });

            // Update Firestore for exception
            if (auth.currentUser) {
                const payload = {};
                Object.keys(updates).forEach(k => {
                    payload[`exceptions.${instanceKey}.${k}`] = updates[k];
                });
                payload[`exceptions.${instanceKey}.isException`] = true;
                await firestoreService.updateReminder(id, payload);
            }
        } else {
            // SERIES UPDATE
            // V10.18 FIX: Skip series splitting if ONLY updating logs (auto-complete)
            const isLogsOnlyUpdate = Object.keys(updates).length === 1 && updates.logs;

            // Check if we need to split history to preserve old data
            const todayStr = new Date().toLocaleDateString('en-CA');
            const yesterdayObj = new Date();
            yesterdayObj.setDate(yesterdayObj.getDate() - 1);
            const yesterdayStr = yesterdayObj.toLocaleDateString('en-CA');

            const startDate = reminder.schedule?.startDate || reminder.date;
            const isRecurring = reminder.schedule?.type === 'recurring' || (reminder.frequency && reminder.frequency !== 'Once');

            if (!isLogsOnlyUpdate && isRecurring && startDate && startDate < yesterdayStr) {
                console.log("History Preservation: Soft splitting series.");

                // Determine Split Point
                const targetStartDate = updates.schedule?.startDate || todayStr;
                const splitDateObj = new Date(targetStartDate);
                splitDateObj.setDate(splitDateObj.getDate() - 1);
                const oldSeriesEndDate = splitDateObj.toLocaleDateString('en-CA');

                // 1. END OLD SERIES locally
                store.reminders = store.reminders.map(r => {
                    if (String(r.id) === String(id)) {
                        return {
                            ...r,
                            schedule: { ...r.schedule, endDate: oldSeriesEndDate },
                            status: 'ended'
                        };
                    }
                    return r;
                });

                // 2. ADD NEW SERIES locally
                const newId = String(Date.now());
                const newReminder = {
                    ...reminder,
                    ...updates,
                    id: newId,
                    schedule: {
                        ...(reminder.schedule || {}),
                        ...updates.schedule,
                        startDate: targetStartDate,
                        endDate: updates.schedule?.endDate || null
                    }
                };
                delete newReminder.exceptions; // Reset exceptions for new series
                delete newReminder.logs; // Reset logs for new series
                store.reminders.push(newReminder);

                // V10.16: Auto-complete ANY past instances in the NEW series
                try {
                    const startStr = newReminder.schedule?.startDate;
                    if (startStr) {
                        const todayStr = new Date().toLocaleDateString('en-CA');
                        const now = new Date();
                        const logs = {};
                        let hasUpdates = false;

                        const loopDate = new Date(startStr);
                        loopDate.setHours(0, 0, 0, 0);
                        const limitDate = new Date(todayStr);
                        limitDate.setHours(0, 0, 0, 0);

                        const oneDay = 24 * 60 * 60 * 1000;
                        let iterations = 0;

                        while (loopDate <= limitDate && iterations < 365) {
                            const dStr = loopDate.toLocaleDateString('en-CA');
                            const instances = dataService.expandRemindersForDate(dStr, [newReminder], store.settings || {});

                            instances.forEach(inst => {
                                let isPast = false;
                                if (dStr < todayStr) isPast = true;
                                else if (dStr === todayStr) {
                                    if (inst.time) {
                                        const instanceDate = new Date(`${dStr}T${inst.time}`);
                                        if (instanceDate < now) isPast = true;
                                    }
                                }

                                if (isPast) {
                                    logs[inst.instanceKey] = {
                                        status: 'taken',
                                        takenAt: new Date().toISOString()
                                    };
                                    hasUpdates = true;
                                }
                            });
                            loopDate.setTime(loopDate.getTime() + oneDay);
                            iterations++;
                        }

                        if (hasUpdates) {
                            newReminder.logs = { ...(newReminder.logs || {}), ...logs };
                        }
                    }
                } catch (e) {
                    console.error("Auto-complete failed in updateReminder split", e);
                }

                // 3. Update Firestore
                if (auth.currentUser) {
                    // Update old series endDate
                    await firestoreService.updateReminder(id, {
                        schedule: { ...reminder.schedule, endDate: oldSeriesEndDate },
                        status: 'ended'
                    });
                    // Create new series
                    await firestoreService.addReminder(newReminder);
                }
            } else {
                // NORMAL UPDATE (local)
                // V10.20 FIX: Reset 'missed' status if Date or Time is changed
                if (updates.time || updates.date || (updates.schedule && updates.schedule.startTime)) {
                    const r = store.reminders.find(item => String(item.id) === String(id));
                    if (r && r.status === 'missed') {
                        updates.status = 'upcoming'; // Reset to upcoming/active
                    }
                }

                store.reminders = store.reminders.map(r => String(r.id) === String(id) ? { ...r, ...updates } : r);

                // V10.17: Auto-complete for NORMAL updates too (but skip if already logs-only)
                if (!isLogsOnlyUpdate) {
                    const reminder = store.reminders.find(r => String(r.id) === String(id));
                    if (reminder && reminder.frequency !== 'Once') {
                        try {
                            const startStr = reminder.schedule?.startDate;
                            if (startStr) {
                                const todayStr = new Date().toLocaleDateString('en-CA');
                                const now = new Date();
                                const logs = {};
                                let hasUpdates = false;

                                const loopDate = new Date(startStr);
                                loopDate.setHours(0, 0, 0, 0);
                                const limitDate = new Date(todayStr);
                                limitDate.setHours(0, 0, 0, 0);

                                const oneDay = 24 * 60 * 60 * 1000;
                                let iterations = 0;

                                while (loopDate <= limitDate && iterations < 365) {
                                    const dStr = loopDate.toLocaleDateString('en-CA');
                                    const instances = dataService.expandRemindersForDate(dStr, [reminder], store.settings || {});

                                    instances.forEach(inst => {
                                        let isPast = false;
                                        if (dStr < todayStr) isPast = true;
                                        else if (dStr === todayStr) {
                                            if (inst.time) {
                                                const instanceDate = new Date(`${dStr}T${inst.time}`);
                                                if (instanceDate < now) isPast = true;
                                            }
                                        }

                                        if (isPast && (!reminder.logs || !reminder.logs[inst.instanceKey])) {
                                            logs[inst.instanceKey] = {
                                                status: 'taken',
                                                takenAt: new Date().toISOString()
                                            };
                                            hasUpdates = true;
                                        }
                                    });
                                    loopDate.setTime(loopDate.getTime() + oneDay);
                                    iterations++;
                                }

                                if (hasUpdates) {
                                    reminder.logs = { ...(reminder.logs || {}), ...logs };
                                    updates.logs = reminder.logs; // Ensure Firestore gets the updated logs
                                }
                            }
                        } catch (e) {
                            console.error("Auto-complete failed in normal update", e);
                        }
                    }
                }

                // NORMAL UPDATE (Firestore)
                if (auth.currentUser) {
                    await firestoreService.updateReminder(id, updates);
                }
            }
        }

        // CRITICAL: Fire storage-update IMMEDIATELY for notification re-scheduling
        save();

        // Also Trigger Schedule refresh manually to be safe
        window.dispatchEvent(new Event('data-updated'));
    },

    // NEW: Detailed Status Logging for Medication
    logReminderStatus: async (id, instanceKey, status) => {
        // V10.20: OPTIMISTIC UPDATE FIRST
        // Update Local Store immediately for UI responsiveness
        if (store.reminders) {
            store.reminders = store.reminders.map(r => {
                if (String(r.id) === String(id)) {
                    const newLogs = { ...(r.logs || {}) };
                    newLogs[instanceKey] = {
                        status: status,
                        takenAt: status === 'taken' ? new Date().toISOString() : null,
                    };
                    return { ...r, logs: newLogs };
                }
                return r;
            });

            // Also add to global history if 'taken'
            if (status === 'taken') {
                const r = store.reminders.find(item => String(item.id) === String(id));
                if (r) {
                    if (!store.history) store.history = [];
                    // Prevent duplicate history entries for same minute?
                    store.history.push({
                        id: Date.now(),
                        reminderId: id,
                        title: r.title,
                        type: r.category || r.type,
                        status: 'taken',
                        date: new Date().toISOString().split('T')[0],
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Persist Local
            await save();
            notifyListeners(); // Force UI refresh
        }

        // THEN Update Firestore
        if (auth.currentUser) {
            try {
                const key = `logs.${instanceKey}`;
                const payload = {
                    [key]: {
                        status: status,
                        takenAt: status === 'taken' ? new Date().toISOString() : null
                    }
                };
                await firestoreService.updateReminder(id, payload);
            } catch (err) {
                console.error("Firestore sync failed for status log:", err);
                // We keep local change. Queueing would be next step.
            }
        }
    },

    // NEW: Status logging with custom timestamp
    logReminderStatusWithTime: async (id, instanceKey, status, customTimestamp) => {
        // V10.20: OPTIMISTIC UPDATE FIRST
        if (store.reminders) {
            store.reminders = store.reminders.map(r => {
                if (String(r.id) === String(id)) {
                    const newLogs = { ...(r.logs || {}) };
                    newLogs[instanceKey] = {
                        status,
                        takenAt: customTimestamp
                    };
                    return { ...r, logs: newLogs };
                }
                return r;
            });

            // Also add to global history if 'taken'
            if (status === 'taken') {
                const r = store.reminders.find(item => String(item.id) === String(id));
                if (r) {
                    if (!store.history) store.history = [];
                    store.history.push({
                        id: Date.now(),
                        reminderId: id,
                        title: r.title,
                        type: r.category || r.type,
                        status: 'taken',
                        date: new Date(customTimestamp).toISOString().split('T')[0],
                        timestamp: customTimestamp
                    });
                }
            }
            save(); // Persist immediately
            notifyListeners();
        }

        // THEN Update Firestore
        if (auth.currentUser) {
            try {
                const key = `logs.${instanceKey}`;
                const payload = {
                    [key]: {
                        status: status,
                        takenAt: customTimestamp
                    }
                };
                await firestoreService.updateReminder(id, payload);
            } catch (err) {
                console.error("Firestore sync failed for timed status:", err);
            }
        }
    },


    // Search Functionality
    searchReminders: (query) => {
        if (!query) return [];
        const lowerQuery = query.toLowerCase();
        const all = dataService.getReminders();

        return all.filter(r => {
            const inTitle = r.title && r.title.toLowerCase().includes(lowerQuery);
            const inInstructions = r.instructions && r.instructions.toLowerCase().includes(lowerQuery);

            // Search in files
            const inFiles = r.files && r.files.some(f =>
                (f.name && f.name.toLowerCase().includes(lowerQuery)) ||
                (f.extractedText && f.extractedText.toLowerCase().includes(lowerQuery))
            );

            return inTitle || inInstructions || inFiles;
        });
    },

    // Legacy/Local completion logic wrapper ...
    completeReminder: (id, instanceKey = null) => {
        if (activeProfile) return; // Read Only
        if (instanceKey) {
            dataService.logReminderStatus(id, instanceKey, 'taken');
        } else {
            // Legacy/Simple Logic
            if (auth.currentUser) {
                const updates = { status: 'done', completedDate: new Date().toLocaleDateString() };
                firestoreService.updateReminder(id, updates);
                return;
            }
            // Local
            if (!store.reminders) return;
            store.reminders = store.reminders.map(r => String(r.id) === String(id) ? { ...r, status: 'done', completedDate: new Date().toLocaleDateString() } : r);
            save();
        }
    },

    deleteReminder: async (id) => {
        if (activeProfile) return; // Read Only

        // 1. Find the reminder to check dates
        const reminder = store.reminders?.find(r => String(r.id) === String(id));

        if (!reminder) return;

        const index = store.reminders.findIndex(r => String(r.id) === String(id));
        if (index === -1) return;

        // Safe Delete Check: Recurring & Started in the Past
        const todayStr = new Date().toLocaleDateString('en-CA');
        const startDate = reminder.schedule?.startDate || reminder.date;
        const isPastRecurring = (reminder.schedule?.type === 'recurring' || (reminder.frequency && reminder.frequency !== 'Once')) &&
            startDate && startDate < todayStr;

        // Check if it's ALREADY ended (Soft Deleted previously)
        const isAlreadyEnded = reminder.schedule?.endDate && reminder.schedule.endDate < todayStr;

        if (isPastRecurring && !isAlreadyEnded) {
            // SOFT DELETE (Archive)
            // End Date = Today - 2 Days (Day Before Yesterday)
            const softEndDateObj = new Date();
            softEndDateObj.setDate(softEndDateObj.getDate() - 2);
            const softEndDate = softEndDateObj.toLocaleDateString('en-CA');

            store.reminders[index] = {
                ...reminder,
                schedule: {
                    ...(reminder.schedule || {}),
                    endDate: softEndDate
                },
                status: 'ended' // Optional flag if needed
            };
        } else {
            // HARD DELETE
            store.reminders.splice(index, 1);
        }

        save();
        if (auth.currentUser) {
            if (isPastRecurring) {
                // For Firestore, we send the updated reminder object
                await firestoreService.updateReminder(id, {
                    schedule: {
                        ...(reminder.schedule || {}),
                        endDate: store.reminders[index].schedule.endDate
                    },
                    status: 'ended'
                });
            } else {
                await firestoreService.deleteReminder(id);
            }
        }
    },

    snoozeReminder: async (id, instanceKey = null, minutes = 15) => {
        if (activeProfile) return; // Read Only
        const now = new Date();
        now.setMinutes(now.getMinutes() + minutes);
        const newTime = now.toISOString();

        // 1. Update Local Store (Immediate UI Refresh - OPTIMISTIC)
        if (instanceKey) {
            store.reminders = (store.reminders || []).map(r => {
                if (String(r.id) === String(id)) {
                    const newLogs = { ...(r.logs || {}) };
                    newLogs[instanceKey] = {
                        status: 'snoozed',
                        snoozedUntil: newTime,
                        timestamp: now.toISOString()
                    };
                    return { ...r, logs: newLogs };
                }
                return r;
            });
        } else {
            const hhmm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
            store.reminders = (store.reminders || []).map(r =>
                String(r.id) === String(id) ? { ...r, time: hhmm, status: 'upcoming' } : r
            );
        }

        save();
        // Trigger generic update event for hooks that don't listen to storage
        window.dispatchEvent(new Event('data-updated'));
        notifyListeners();

        // 2. Update Firestore if authenticated (Async)
        if (auth.currentUser) {
            try {
                if (instanceKey) {
                    const key = `logs.${instanceKey}`;
                    const payload = {
                        [key]: {
                            status: 'snoozed',
                            snoozedUntil: newTime,
                            timestamp: now.toISOString()
                        }
                    };
                    await firestoreService.updateReminder(id, payload);
                } else {
                    const hhmm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                    await firestoreService.updateReminder(id, { time: hhmm, status: 'upcoming' });
                }
            } catch (e) {
                console.error("Firestore snooze failed:", e);
            }
        }

    },

    // History & Reports
    getHistory: () => [...(store.history || [])],

    // Notes
    getNotes: () => {
        const unique = new Map();
        (store.notes || []).forEach(n => {
            if (!unique.has(n.id)) unique.set(n.id, n);
        });
        return Array.from(unique.values());
    },

    addNote: async (note) => {
        // V10.20: Optimistic Add
        const id = note.id || Date.now();
        const newNote = { ...note, id };

        // 1. Update Local
        if (!store.notes) store.notes = [];
        store.notes.unshift(newNote);
        save();
        notifyListeners();

        // 2. Update Cloud
        if (auth.currentUser) {
            try {
                // firestoreService.addNote handles existing ID with setDoc
                await firestoreService.addNote(newNote);
            } catch (e) {
                console.error("Firestore addNote failed:", e);
            }
        }
        return newNote;
    },

    updateNote: async (id, updates) => {
        // V10.20: Optimistic Update
        // 1. Update Local
        if (store.notes) {
            store.notes = store.notes.map(n => String(n.id) === String(id) ? { ...n, ...updates } : n);
            save();
            notifyListeners();
        }

        // 2. Update Cloud
        if (auth.currentUser) {
            try {
                // eslint-disable-next-line no-unused-vars
                const { ownerId, createdAt, ownerEmail, ...cleanUpdates } = updates;
                // Remove undefined values
                Object.keys(cleanUpdates).forEach(key => cleanUpdates[key] === undefined && delete cleanUpdates[key]);

                await firestoreService.updateNote(id, cleanUpdates);
            } catch (e) {
                console.error("Firestore updateNote failed:", e);
            }
        }
    },

    deleteNote: async (id) => {
        if (auth.currentUser) {
            await firestoreService.deleteNote(id);
            return;
        }
        if (!store.notes) return;
        store.notes = store.notes.filter(n => n.id !== id);
        save();
    },

    reorderNotes: async (newNotes) => {
        store.notes = newNotes;
        save();
        if (auth.currentUser) {
            await firestoreService.reorderNotes(newNotes.map(n => n.id));
        }
    },

    shareNote: async (id, email) => {
        // 1. Optimistic Local Update
        const noteIndex = store.notes ? store.notes.findIndex(n => String(n.id) === String(id)) : -1;
        if (noteIndex > -1) {
            const note = store.notes[noteIndex];
            if (!note.sharedWith) note.sharedWith = [];
            if (!note.sharedWith.includes(email)) {
                store.notes[noteIndex].sharedWith = [...note.sharedWith, email];
                save(); // Persist & Notify UI Immediately
            }
        }

        // 2. Firestore Update
        if (auth.currentUser) {
            try {
                await firestoreService.shareNote(id, email);
                return true;
            } catch (e) {
                console.error("Share failed:", e);
                // Optional Sync Revert could go here
                return false;
            }
        } else {
            // Local fallback already handled by optimistic update
            return true;
        }
    },

    unshareNote: async (id, email) => {
        // 1. Optimistic Local Update
        const noteIndex = store.notes ? store.notes.findIndex(n => String(n.id) === String(id)) : -1;
        if (noteIndex > -1) {
            const note = store.notes[noteIndex];
            if (note.sharedWith) {
                store.notes[noteIndex].sharedWith = note.sharedWith.filter(e => e !== email);
                save(); // Persist & Notify UI Immediately
            }
        }

        // 2. Firestore Update
        if (auth.currentUser) {
            try {
                await firestoreService.unshareNote(id, email);
                return true;
            } catch (e) {
                console.error("Unshare failed:", e);
                return false;
            }
        }
        return true;
    },

    // Caregivers
    getCaregivers: () => activeProfile ? [] : [...(store.caregivers || [])],

    addCaregiver: async (caregiver) => {
        if (auth.currentUser) {
            await firestoreService.addCaregiver(caregiver);
            return;
        }
        const newCaregiver = { ...caregiver, id: Date.now(), status: 'Pending' };
        if (!store.caregivers) store.caregivers = [];
        store.caregivers.push(newCaregiver);
        save();
        return newCaregiver;
    },

    updateCaregiver: (id, updates) => {
        if (!store.caregivers) return;
        store.caregivers = store.caregivers.map(c => c.id === id ? { ...c, ...updates } : c);
        save();
    },

    deleteCaregiver: async (id) => {
        if (auth.currentUser) {
            await firestoreService.deleteCaregiver(id);
            return;
        }
        if (!store.caregivers) return;
        store.caregivers = store.caregivers.filter(c => c.id !== id);
        save();
    },

    // Search
    search: (query) => {
        const lowerQ = query.toLowerCase();
        const synonyms = {
            'doctor': ['dr', 'dr.'],
            'dr': ['doctor', 'dr.'],
            'meds': ['medication', 'pill'],
            'medication': ['meds', 'pill'],
            'appointment': ['visit'],
            'visit': ['appointment']
        };

        const terms = [lowerQ];
        Object.keys(synonyms).forEach(key => {
            if (lowerQ.includes(key)) {
                synonyms[key].forEach(syn => terms.push(lowerQ.replaceAll(key, syn)));
            }
        });

        const checkMatch = (text) => {
            if (!text) return false;
            const lowerText = text.toLowerCase();
            return terms.some(term => lowerText.includes(term));
        };

        const reminders = (store.reminders || []).filter(r =>
            checkMatch(r.title) ||
            checkMatch(r.instructions) ||
            checkMatch(r.type) ||
            (r.files && r.files.some(f => checkMatch(f.name) || checkMatch(f.extractedText)))
        );

        const notes = (store.notes || []).filter(n =>
            checkMatch(n.title) ||
            checkMatch(n.content) ||
            checkMatch(n.type) ||
            (n.tags && n.tags.some(tag => checkMatch(tag))) ||
            (n.files && n.files.some(f => checkMatch(f.name) || checkMatch(f.extractedText)))
        );

        return { reminders, notes };
    },

    // Settings
    getSettings: () => ({ ...(store.settings || { sleepStart: '22:00', sleepEnd: '08:00' }) }),

    updateSettings: async (newSettings) => {
        store.settings = { ...(store.settings || {}), ...newSettings };
        save();

        if (auth.currentUser) {
            await firestoreService.updateSettings(store.settings);
        }
    },

    deleteAllData: async () => {
        if (auth.currentUser) {
            await firestoreService.deleteAllUserData();
        }
        localStorage.removeItem(getStorageKey());
        store = JSON.parse(JSON.stringify(defaultData));
        window.location.reload();
    },

    _reset: () => {
        store = JSON.parse(JSON.stringify(defaultData));
    },

    // CONVERSION HELPERS
    convertNoteToReminder: (note) => {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        return {
            title: note.title,
            instructions: note.content,
            type: 'Other',
            id: null,
            isShared: false,
            status: 'upcoming',
            time: `${h}:${m}`,
            date: now.toISOString().split('T')[0]
        };
    },

    convertReminderToNote: (reminder) => {
        return {
            title: reminder.title,
            content: `Frequency: ${reminder.frequency || 'Once'}\nInstructions: ${reminder.instructions || 'None'}`,
            type: 'text',
            tags: [reminder.type || 'Other']
        };
    }
};
