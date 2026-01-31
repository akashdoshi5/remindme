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
        store = loadStore(); // Load whatever local data exists for this user

        // 3. Sync-Up Check
        if (uid && ((store.reminders && store.reminders.length > 0) || (store.notes && store.notes.length > 0))) {
            console.log("Authenticated User: Syncing local cache to Cloud...");
            firestoreService.migrateLocalData(store).catch(e => console.error("Sync-up failed", e));
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
    addCaregiver: async (email) => {
        // Add a "Caregiver" (Viewer) to MY list
        // We create a doc in my subcollection
        await firestoreService.addCaregiver({ email, status: 'invited', createdAt: new Date().toISOString() });
        // Refresh local list happens via sync logic usually, but let's assume realtime listener handles it
    },

    getPatientsForMe: async () => {
        if (!auth.currentUser) return [];
        return await firestoreService.getPatientsForCaregiver(auth.currentUser.email);
    },

    // SYNC: Update local store from Cloud (acting as cache)
    syncFromCloud: (type, data) => {
        if (activeProfile) return; // Don't sync cloud data into 'store' if we are viewing someone else (though cloud sync should usually target 'store')
        // Actually sync listeners should update 'store' regardless of view?
        // Yes, background sync should keep 'store' fresh.

        if (type === 'reminders') store.reminders = data;
        if (type === 'notes') store.notes = data;
        if (type === 'caregivers') store.caregivers = data;

        if (type === 'settings') {
            store.settings = { ...(store.settings || {}), ...data };
        }

        // Save to local storage for offline use / persistence
        save();
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

                        // Calculate Effective Time
                        // Calculate Effective Time & Check Status
                        // FIX: Handle ISO Snooze Time for correct status (even if snoozed to next day)
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
                            uniqueId: `${r.id}_${instanceKey}`,
                            instanceKey: instanceKey,
                            time: time, // Original time
                            displayTime: displayTime, // Potentially snoozed time
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
                            const instanceKey = `${dateString}_time_${timeStr}`;
                            const log = (r.logs || {})[instanceKey];

                            // Status Check
                            let status = 'upcoming';
                            const iDate = new Date(dateString);
                            iDate.setHours(currentH, 0, 0, 0);

                            if (log) status = log.status;
                            else if (iDate < now) status = 'missed'; // Auto miss if past

                            expanded.push({
                                ...r,
                                uniqueId: `${r.id}_${instanceKey}`,
                                instanceKey,
                                displayTime: timeStr,
                                status,
                                isInterval: true,
                                targetDate: dateString
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
                        const instanceKey = `${dateString}_${time || 'default'}`;
                        const log = (r.logs || {})[instanceKey];
                        const exception = (r.exceptions || {})[instanceKey];

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
        if (auth.currentUser) {
            return await firestoreService.addReminder(reminder);
        }
        const newReminder = { ...reminder, id: Date.now() };
        if (!store.reminders) store.reminders = [];
        store.reminders.push(newReminder);
        save();
        return newReminder;
    },

    updateReminder: async (id, updates, instanceKey = null) => {
        if (activeProfile) return; // Read Only
        // CRITICAL FIX: Always update local store first for immediate UI/notification refresh
        if (!store.reminders) store.reminders = [];

        if (instanceKey) {
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
        } else {
            // Normal update (local)
            store.reminders = store.reminders.map(r => String(r.id) === String(id) ? { ...r, ...updates } : r);
        }



        // CRITICAL: Fire storage-update IMMEDIATELY for notification re-scheduling
        save();

        // Also Trigger Schedule refresh manually to be safe
        window.dispatchEvent(new Event('data-updated'));

        // THEN update Firestore (async, will sync back later)
        if (auth.currentUser) {
            if (instanceKey) {
                const key = `exceptions.${instanceKey}`;
                // Deep merge is safer for exceptions
                const payload = {};
                Object.keys(updates).forEach(k => {
                    payload[`exceptions.${instanceKey}.${k}`] = updates[k];
                });
                payload[`exceptions.${instanceKey}.isException`] = true;

                await firestoreService.updateReminder(id, payload);
            } else {
                await firestoreService.updateReminder(id, updates);
            }
        }
    },

    // NEW: Detailed Status Logging for Medication
    logReminderStatus: async (id, instanceKey, status) => {
        if (auth.currentUser) {
            const key = `logs.${instanceKey}`;
            const payload = {
                [key]: {
                    status: status,
                    takenAt: status === 'taken' ? new Date().toISOString() : null
                }
            };
            await firestoreService.updateReminder(id, payload);
        }

        if (!store.reminders) return;

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
        await save();
    },

    // NEW: Status logging with custom timestamp
    logReminderStatusWithTime: async (id, instanceKey, status, customTimestamp) => {
        if (auth.currentUser) {
            const key = `logs.${instanceKey}`;
            const payload = {
                [key]: {
                    status: status,
                    takenAt: customTimestamp
                }
            };
            // Also update history in Firestore if needed? 
            // Current `updateReminder` just updates the reminder doc. 
            // History is separate or derived? 
            // In `dataService.updateReminder` logic implies history is local or not fully synced separately?
            // Actually `firestoreService` has `addHistory`? No, history is derived or inside user doc?
            // `data.js` says `store.history` is local. Cloud might imply history is just logs.
            // Let's ensure at least the Reminder Log is updated.
            await firestoreService.updateReminder(id, payload);
        }

        if (!store.reminders) return;
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
        save();
    },

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

        // Helper: Check if start date is in the past
        const isStartedInPast = () => {
            if (!reminder) return false;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const startDateStr = reminder.schedule?.startDate || reminder.date;
            if (!startDateStr) return false; // Default to delete if no start date

            const startDate = new Date(startDateStr);
            // startDate is usually YYYY-MM-DD, parsing it might be UTC or Local depending on browser.
            // 'en-CA' format YYYY-MM-DD usually parses as UTC in some contexts or local.
            // Safest is string comparison if format matches?
            // Let's use string comparison for YYYY-MM-DD
            const todayStr = today.toLocaleDateString('en-CA');
            return startDateStr < todayStr;
        };

        if (reminder && isStartedInPast()) {
            // SOFT DELETE (End Date = Yesterday)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('en-CA');

            const updates = { endDate: yesterdayStr, status: 'ended' };

            if (auth.currentUser) {
                await firestoreService.updateReminder(id, updates);
            } else {
                store.reminders = store.reminders.map(r => String(r.id) === String(id) ? { ...r, ...updates } : r);
                save();
            }
        } else {
            // HARD DELETE (Future or Today or Not Found)
            if (auth.currentUser) {
                await firestoreService.deleteReminder(id);
                return;
            }
            if (!store.reminders) return;
            store.reminders = store.reminders.filter(r => String(r.id) !== String(id));
            save();
        }
    },

    snoozeReminder: async (id, instanceKey = null, minutes = 15) => {
        if (activeProfile) return; // Read Only
        const now = new Date();
        now.setMinutes(now.getMinutes() + minutes);

        // FIX: Use full ISO string for snooze target to support cross-day snoozes and timezone safety
        const newTimeISO = now.toISOString();
        const legacyTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

        // We prefer ISO, but existing code might expect something? 
        // We'll update the callers to handle ISO (as we did in getRemindersForDate)
        const newTime = newTimeISO;


        if (auth.currentUser) {
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
                await firestoreService.updateReminder(id, { time: newTime, status: 'upcoming' });
            }
            return;
        }

        if (instanceKey) {
            store.reminders = store.reminders.map(r => {
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
            save();
            return;
        }

        if (!store.reminders) return;
        store.reminders = store.reminders.map(r => String(r.id) === String(id) ? { ...r, time: newTime, status: 'upcoming' } : r);
        save();
        return store.reminders.find(r => String(r.id) === String(id));
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
        if (auth.currentUser) {
            return await firestoreService.addNote(note);
        }
        const newNote = { ...note, id: Date.now() };
        if (!store.notes) store.notes = [];
        store.notes.unshift(newNote);
        save();
        return newNote;
    },
    updateNote: async (id, updates) => {
        if (auth.currentUser) {
            // sanitize updates to remove ownerId, sharedWith, createdAt, etc.
            // eslint-disable-next-line no-unused-vars
            const { ownerId, sharedWith, createdAt, ownerEmail, ...cleanUpdates } = updates;
            await firestoreService.updateNote(id, cleanUpdates);
            return;
        }
        if (!store.notes) return;
        store.notes = store.notes.map(n => n.id === id ? { ...n, ...updates } : n);
        save();
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
        // Optimistic local update
        store.notes = newNotes;
        save();

        if (auth.currentUser) {
            // For Firestore, maintaining exact array order might be tricky without an 'order' field.
            // We'll update the 'order' field for all notes.
            // Batch update is best here.
            await firestoreService.reorderNotes(newNotes.map(n => n.id));
        }
    },

    shareNote: async (id, email) => {
        if (auth.currentUser) {
            await firestoreService.shareNote(id, email);
            return true;
        }
        return false; // Not supported offline
    },

    unshareNote: async (id, email) => {
        if (auth.currentUser) {
            await firestoreService.unshareNote(id, email);
            return true;
        }
        return false;
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
        // Not implemented in firestoreService yet? 
        // Just mocking it for now or local only? 
        // Caregiver updates usually minimal.
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

        // Simple synonym mapping
        const synonyms = {
            'doctor': ['dr', 'dr.'],
            'dr': ['doctor', 'dr.'],
            'meds': ['medication', 'pill'],
            'medication': ['meds', 'pill'],
            'appointment': ['visit'],
            'visit': ['appointment']
        };

        // Expand query terms
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
            checkMatch(r.type)
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
        // Force reload to clear state effectively
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
