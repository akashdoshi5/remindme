import { auth } from './firebase';
import { firestoreService } from './firestoreService';
import { deleteField } from 'firebase/firestore';

const BASE_STORAGE_KEY = 'remindme_buddy_db';
let currentUserId = null;

const getStorageKey = () => currentUserId ? `${BASE_STORAGE_KEY}_${currentUserId}` : `${BASE_STORAGE_KEY}_guest`;

// V10.29: Robust Date Key Generation (Avoid Locale issues)
export const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

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
        if (local) return JSON.parse(local);
        return JSON.parse(JSON.stringify(defaultData));
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

                // V10: Ensure ownerId is attached to all migrated data
                const sanitizedStore = { ...store };
                if (sanitizedStore.reminders) {
                    sanitizedStore.reminders = sanitizedStore.reminders.map(r => ({ ...r, ownerId: uid, ownerEmail: auth.currentUser?.email }));
                }
                if (sanitizedStore.notes) {
                    sanitizedStore.notes = sanitizedStore.notes.map(n => ({ ...n, ownerId: uid, ownerEmail: auth.currentUser?.email }));
                }

                try {
                    await firestoreService.migrateLocalData(sanitizedStore);
                    console.log("Migration complete.");
                } catch (e) {
                    console.error("Sync-up failed", e);
                }
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
                // AUTO-REPAIR: Fix orphan notes (missing ownerId) that we can access
                if (auth.currentUser) {
                    notes.forEach(n => {
                        if (!n.ownerId && (n.ownerEmail === auth.currentUser.email || n.userId === auth.currentUser.uid)) {
                            console.log(`[Auto-Repair] Fixing orphan note ${n.id} (adding ownerId)`);
                            firestoreService.updateNote(n.id, { ownerId: auth.currentUser.uid });
                        }
                    });
                }

                // V10.25 FIX: Preserver SHARED notes when updating owned notes
                // Current store has [Owned + Shared]. 'notes' is just [Owned].
                const currentShared = (store.notes || []).filter(n => n.isShared);

                // Deduplicate in case 'notes' (Owned) somehow includes Shared (unlikely but safe)
                const newOwnedMap = new Map();
                notes.forEach(n => newOwnedMap.set(n.id, n));

                // Add shared back if not in newOwned
                currentShared.forEach(n => {
                    if (!newOwnedMap.has(n.id)) {
                        newOwnedMap.set(n.id, n);
                    }
                });

                store.notes = Array.from(newOwnedMap.values()).map(n => ({
                    ...n,
                    isPinned: !!n.isPinned
                }));

                // Sort by createdAt descending
                store.notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                save(); // Persist to local storage
                notifyListeners();
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

                // Force boolean for consistency
                store.notes = store.notes.map(n => ({ ...n, isPinned: !!n.isPinned }));

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
                    // Merge Logs: Conflict Resolution Strategy
                    const mergedLogs = { ...cloudR.logs }; // Start with Cloud as base

                    if (localR.logs) {
                        Object.keys(localR.logs).forEach(key => {
                            const localLog = localR.logs[key];
                            const cloudLog = mergedLogs[key];

                            // Case 1: Cloud doesn't have this log yet (New local action)
                            if (!cloudLog) {
                                mergedLogs[key] = localLog;
                            }
                            // Case 2: Conflict - Check timestamps
                            else {
                                // If local has a timestamp and cloud doesn't, or local is newer
                                const localTime = localLog.updatedAt ? new Date(localLog.updatedAt).getTime() : 0;
                                const cloudTime = cloudLog.updatedAt ? new Date(cloudLog.updatedAt).getTime() : 0;

                                // Heuristic: If I just acted on it (localTime > cloudTime), keep local.
                                // If equal, prefer 'taken' over 'missed' (positive status wins)
                                if (localTime > cloudTime) {
                                    mergedLogs[key] = localLog;
                                } else if (localTime === cloudTime) {
                                    // Tie-breaker: Taken/Snoozed > Missed/Upcoming
                                    if (localLog.status === 'taken' && cloudLog.status !== 'taken') {
                                        mergedLogs[key] = localLog;
                                    }
                                }
                            }
                        });
                    }

                    // V10.35: Also merge Exceptions to preserve pending instance edits
                    const mergedExceptions = { ...cloudR.exceptions }; // Start with Cloud
                    if (localR.exceptions) {
                        Object.keys(localR.exceptions).forEach(key => {
                            const localEx = localR.exceptions[key];
                            const cloudEx = mergedExceptions[key];

                            if (!cloudEx) {
                                // Cloud doesn't have this exception yet - keep local
                                mergedExceptions[key] = localEx;
                            } else {
                                // Both have it - compare by updatedAt if available, otherwise keep local
                                const localTime = localEx.updatedAt ? new Date(localEx.updatedAt).getTime() : Date.now();
                                const cloudTime = cloudEx.updatedAt ? new Date(cloudEx.updatedAt).getTime() : 0;
                                if (localTime >= cloudTime) {
                                    mergedExceptions[key] = localEx;
                                }
                            }
                        });
                    }

                    return { ...cloudR, logs: mergedLogs, exceptions: mergedExceptions };
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

    // MANUAL SYNC (User Requested)
    forceSync: async () => {
        if (!auth.currentUser) return;
        console.log("🔄 Force Sync Initiated...");
        try {
            const [reminders, notesOwned, notesShared, caregivers, settings] = await Promise.all([
                firestoreService.fetchReminders(),
                firestoreService.fetchNotesOwned(),
                firestoreService.fetchNotesShared(),
                firestoreService.fetchCaregivers(),
                firestoreService.fetchSettings()
            ]);

            dataService.syncFromCloud('reminders', reminders);

            // Combine Notes
            const map = new Map();
            notesOwned.forEach(n => map.set(n.id, n));
            notesShared.forEach(n => map.set(n.id, n));
            dataService.syncFromCloud('notes', Array.from(map.values()));

            dataService.syncFromCloud('caregivers', caregivers);
            dataService.syncFromCloud('settings', settings);

            console.log("✅ Force Sync Complete");
            return true;
        } catch (e) {
            console.error("Force Sync Failed:", e);
            return false;
        }
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

            // Scope Helper: Define 'show' at top level of loop to avoid ReferenceErrors
            let show = false;

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

                        const instanceKey = `${dateString}_period_${period}`; // Unique key per period

                        const log = (r.logs || {})[instanceKey];

                        // Check for EXCEPTION (Edit Instance)
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
                    const match = r.frequency.match(/Every\s+(\d+)\s*(h|hour|hours)?/i);
                    const intervalHours = match ? parseInt(match[1]) : NaN;

                    if (!isNaN(intervalHours)) {
                        let startH, startM;
                        const startDateStr = r.schedule?.startDate || r.date;
                        const isStratDate = startDateStr === dateString;

                        // 1. Determine Start Time for THIS DAY
                        // If it is the Start Date, we MUST start at the User's Time (e.g. 17:00).
                        // If it is a subsequent day, we start at Sleep End (e.g. 08:00) OR User's Window Start.
                        if (isStratDate && r.time) {
                            [startH, startM] = r.time.split(':').map(Number);
                        } else if (r.startTime) {
                            [startH, startM] = r.startTime.split(':').map(Number);
                        } else {
                            [startH, startM] = sleepEnd.split(':').map(Number);
                        }

                        // 2. Determine End Limit (Sleep Start or Window End)
                        const [limitH, limitM] = r.endTime ? r.endTime.split(':').map(Number) : sleepStart.split(':').map(Number);

                        let currentMinutes = startH * 60 + startM;
                        let limitMinutes = limitH * 60 + limitM;

                        // Handle crossing midnight (e.g. Start 22:00, End 02:00)
                        if (limitMinutes < currentMinutes) {
                            limitMinutes += 24 * 60;
                        }

                        // Safety: Cap to 24h
                        if (limitMinutes - currentMinutes > 24 * 60) {
                            limitMinutes = currentMinutes + 24 * 60;
                        }

                        // 3. Generate Intervals
                        const step = intervalHours * 60;
                        const times = [];

                        if (step > 0) {
                            // Loop
                            while (currentMinutes <= limitMinutes) {
                                // Formatting
                                let h = Math.floor(currentMinutes / 60);
                                const m = currentMinutes % 60;

                                // Normalize 24h+ to 0-23
                                if (h >= 24) h -= 24;

                                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                times.push(timeStr);

                                currentMinutes += step;
                            }
                        }

                        // Process the generated times
                        times.forEach(time => {
                            // ... (Standard Instance Generation Logic) ...
                            // RE-USE the logic below by pushing to a temporary list or refactoring?
                            // To minimize code duplication, we can just push to 'times' array and let the shared loop handle it?
                            // No, the existing code structure has 'times' processing inside the `if (match)`.
                            // Let's execute the instance creation here directly.

                            // ---------------------------------------------------------
                            // EXECUTION OF INSTANCE CREATION
                            // ---------------------------------------------------------

                            // Helper to check multiple key formats (New YYYY-MM-DD vs Legacy M/D/YYYY)
                            const tryGetLog = (collection, dateStr, timeStr) => {
                                if (!collection) return null;

                                // 1. Standard Modern Key (YYYY-MM-DD_HH:MM)
                                const key1 = `${dateStr}_${timeStr}`;
                                if (collection[key1]) return { key: key1, data: collection[key1] };

                                // 2. Legacy Key with 'time' literal (YYYY-MM-DD_time_HH:MM) - Migration V5
                                const key2 = `${dateStr}_time_${timeStr}`;
                                if (collection[key2]) return { key: key2, data: collection[key2] };

                                // 3. Legacy Locale Date Formats (M/D/YYYY, D/M/YYYY) - Legacy App Sync
                                const [y, m, d] = dateStr.split('-').map(Number);
                                const formats = [
                                    `${m}/${d}/${y}`, `${d}/${m}/${y}`,
                                    `${m}/${d}/${String(y).slice(-2)}`, `${d}/${m}/${String(y).slice(-2)}`
                                ];

                                for (const f of formats) {
                                    const kA = `${f}_${timeStr}`;
                                    const kB = `${f}_time_${timeStr}`;
                                    if (collection[kA]) return { key: kA, data: collection[kA] };
                                    if (collection[kB]) return { key: kB, data: collection[kB] };
                                }
                                return null;
                            };

                            // NEW: Fuzzy Time Matching for Interval Shifts (e.g. Schedule Drift of 1 hour)
                            const findNearestLog = (collection, dateStr, targetTimeStr) => {
                                if (!collection) return null;
                                // Only run fuzzy match if specific key not found
                                const allKeys = Object.keys(collection);

                                // Filter keys belonging to THIS date
                                // Keys format: YYYY-MM-DD_time_HH:MM or YYYY-MM-DD_HH:MM
                                const candidateKeys = allKeys.filter(k => k.startsWith(dateStr));

                                if (candidateKeys.length === 0) return null;

                                const [hTarget, mTarget] = targetTimeStr.split(':').map(Number);
                                const targetMinutes = hTarget * 60 + mTarget;

                                let closestKey = null;
                                let minDiff = 90; // Tolerance: 90 Minutes (Matches 1 hour shift)

                                candidateKeys.forEach(key => {
                                    // Extract time part from key
                                    // Key could be "2026-02-07_16:00" or "2026-02-07_time_16:00"
                                    const parts = key.split('_');
                                    const timePart = parts[parts.length - 1]; // Always last part? Yes.

                                    if (timePart.includes(':')) {
                                        const [h, m] = timePart.split(':').map(Number);
                                        const mins = h * 60 + m;
                                        const diff = Math.abs(mins - targetMinutes);

                                        if (diff < minDiff) {
                                            minDiff = diff;
                                            closestKey = key;
                                        }
                                    }
                                });

                                if (closestKey) {
                                    if (dateStr === '2026-02-07') {
                                        console.log(`[FuzzyMatch] Mapped ${targetTimeStr} to ${closestKey} (Diff: ${minDiff}m)`);
                                    }
                                    return { key: closestKey, data: collection[closestKey] };
                                }
                                return null;
                            };

                            let instanceKey = `${dateString}_${time}`;

                            // 1. Try Exact Matches (Fast)
                            let foundLog = tryGetLog(r.logs, dateString, time);
                            let foundEx = tryGetLog(r.exceptions, dateString, time);

                            // 2. Fallback: Fuzzy Time Match (If Exact Failed)
                            // Note: Only if it's an Interval reminder? Or safe for all? 
                            // Safe for all because we check specific date keys.
                            if (!foundLog) foundLog = findNearestLog(r.logs, dateString, time);
                            if (!foundEx) foundEx = findNearestLog(r.exceptions, dateString, time);

                            // Use the found key if available to ensure we map back to the correct data
                            if (foundLog) instanceKey = foundLog.key;
                            else if (foundEx) instanceKey = foundEx.key;

                            const log = foundLog ? foundLog.data : undefined;
                            const exception = foundEx ? foundEx.data : undefined;

                            if (exception && exception.status === 'cancelled') return;
                            // Strict Date Check: If exception moves it to another date, hide it from THIS date's list
                            // But if exception.date matches dateString, we keep it.
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

                            let status = 'upcoming';
                            const now = new Date();
                            const twoHoursMs = 2 * 60 * 60 * 1000;
                            const diff = now.getTime() - checkDateTime.getTime();

                            if (log && log.status === 'taken') status = 'taken';
                            else if (log && log.status === 'missed') status = 'missed';
                            else if (log && log.status === 'snoozed' && diff < twoHoursMs) status = 'snoozed';
                            else if (diff > twoHoursMs) status = 'missed';
                            else status = 'upcoming';

                            // Future safety
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const dObj = new Date(dateString);
                            dObj.setHours(0, 0, 0, 0);
                            if (dObj > today && status === 'missed') status = 'upcoming';

                            let takenAt = log ? log.takenAt : null;
                            if (status === 'taken' && takenAt) {
                                const d = new Date(takenAt);
                                displayTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                            }

                            expanded.push({
                                ...r,
                                ...exception,
                                files: (exception && exception.files && exception.files.length > 0) ? exception.files : (r.files || []),
                                uniqueId: `${r.id}_${instanceKey}`,
                                instanceKey: instanceKey,
                                displayTime: displayTime,
                                status: status,
                                takenAt: takenAt,
                                isVirtual: true,
                                isInterval: true,
                                targetDate: dateString,
                                time: displayTime
                            });
                        });
                        return; // Done with this reminder
                    }
                }

                // 2. Standard Frequencies (Daily, Weekly, etc)
                if (r.frequency && r.frequency.startsWith('Every')) show = true;
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
                        // Standardize Key Lookup (Reuse helper logic if possible, or repeat inline)
                        // Repeating inline for scope access, but simplified
                        let instanceKey = `${dateString}_${time || 'default'}`;

                        // Legacy Locale Support for Standard Reminders
                        const [y, m, d] = dateString.split('-').map(Number);
                        const legacyDates = [
                            `${m}/${d}/${y}`, `${d}/${m}/${y}`,
                            `${m}/${d}/${String(y).slice(-2)}`, `${d}/${m}/${String(y).slice(-2)}`
                        ];

                        // Search logic
                        let checkKeys = [
                            instanceKey,
                            `${dateString}_time_${time || 'default'}`
                        ];
                        // Add legacy date combinations
                        legacyDates.forEach(ld => {
                            checkKeys.push(`${ld}_${time || 'default'}`);
                            checkKeys.push(`${ld}_time_${time || 'default'}`);
                        });

                        // Find first match
                        let log, exception;

                        for (const k of checkKeys) {
                            if ((r.logs || {})[k]) {
                                log = r.logs[k];
                                instanceKey = k;
                                break;
                            }
                            if ((r.exceptions || {})[k]) {
                                exception = r.exceptions[k];
                                instanceKey = k;
                                break;
                            }
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

                        // V10.24 FIX: Override displayTime with takenAt if status is taken -> REMOVED per User Request (Keep Schedule Time)
                        // This ensures the UI sorts by SCHEDULED time, not completion time.
                        let takenAt = log ? log.takenAt : null;
                        // if (status === 'taken' && takenAt) { ... } REMOVED

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

                        // Merge log data (takenAt, custom time) into the expanded object.
                        // Merge log data (takenAt, custom time) into the expanded object.
                        // Prioritize log.takenAt for display time -> REMOVED (Keep Schedule Time)
                        let takenAt = log ? log.takenAt : null;
                        // if (status === 'taken' && takenAt) { ... } REMOVED

                        expanded.push({
                            ...r,
                            ...ex, // Apply Exception Data (Title, Notes, etc)
                            files: (ex.files && ex.files.length > 0) ? ex.files : (r.files || []),
                            uniqueId: `${r.id}_${key}`,
                            instanceKey: key,
                            displayTime: displayTime,
                            status: status,
                            takenAt: takenAt,
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

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);

            // FIX: Manual formatting to guarantee YYYY-MM-DD (avoid Locale/WebView inconsistencies)
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            const reminders = dataService.getRemindersForDate(dateStr);

            // Filter only valid upcoming ones (not taken, not missed/past - unless snoozed active)
            const active = reminders.filter(r =>
                r.status === 'upcoming' || r.status === 'snoozed'
            );
            allUpcoming.push(...active);
        }
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
                        isException: true,
                        updatedAt: new Date().toISOString() // V10.35: Track for merge priority
                    };

                    // V10.24 FIX: If Time or Date is updated, we check if we should PRESERVE the 'taken' status
                    // instead of blindly clearing the log (which reverts it to upcoming/missed).
                    let logs = r.logs || {};
                    if ((updates.time || updates.date) && logs[instanceKey]) {
                        const oldLog = logs[instanceKey];
                        if (oldLog.status === 'taken') {
                            console.log("DataService: Preserving 'taken' status for updated exception:", instanceKey);

                            // Calculate new takenAt time to align with the new schedule
                            // (Assumption: User is correcting the record)
                            let newTakenAt = oldLog.takenAt || new Date().toISOString();

                            try {
                                const datePart = updates.date || instanceKey.split('_')[0];
                                const timePart = updates.time || (r.time || '09:00'); // Fallback if time not in updates?

                                // Only update time if we have valid parts
                                if (datePart && timePart.includes(':')) {
                                    const [h, m] = timePart.split(':').map(Number);
                                    const d = new Date(datePart);
                                    d.setHours(h, m, 0, 0);
                                    newTakenAt = d.toISOString();
                                }
                            } catch (err) {
                                console.warn("Could not recalculate takenAt, keeping original", err);
                            }

                            logs = { ...logs };
                            logs[instanceKey] = {
                                ...oldLog,
                                takenAt: newTakenAt,
                                updatedAt: new Date().toISOString()
                            };
                        } else {
                            // If 'snoozed' or 'missed', it's safe to reset if user reschedules.
                            // e.g. "I missed it, so I'll move it to later" -> Becomes Upcoming.
                            console.log("DataService: Clearing sticky log for updated exception:", instanceKey);
                            logs = { ...logs };
                            delete logs[instanceKey];
                        }
                    }

                    return { ...r, exceptions, logs };
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

                // Also delete log field if time changed (unless we decided to keep it locally!)
                if (updates.time || updates.date) {
                    // Check LOCAL store to see if we kept it (Optimistic check)
                    const tempR = store.reminders.find(r => String(r.id) === String(id));
                    const preservedLog = tempR?.logs?.[instanceKey];

                    if (preservedLog && preservedLog.status === 'taken') {
                        // Update the log in Firestore instead of deleting
                        payload[`logs.${instanceKey}`] = preservedLog;
                    } else {
                        // Delete as usual
                        payload[`logs.${instanceKey}`] = deleteField();
                    }
                }

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
                                const todayStr = getTodayString();
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
                        updatedAt: new Date().toISOString() // V10.21: Timestamp for Sync
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
                        takenAt: status === 'taken' ? new Date().toISOString() : null,
                        updatedAt: new Date().toISOString()
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
                        takenAt: customTimestamp,
                        updatedAt: new Date().toISOString()
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
                        takenAt: customTimestamp,
                        updatedAt: new Date().toISOString()
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
                        updatedAt: now.toISOString(), // Fix for Sync Reversion (was missing)
                        timestamp: now.toISOString()
                    };
                    return { ...r, logs: newLogs };
                }
                return r;
            });
        } else {
            const hhmm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
            const yyyy_mm_dd = now.toLocaleDateString('en-CA'); // YYYY-MM-DD

            store.reminders = (store.reminders || []).map(r => {
                if (String(r.id) === String(id)) {
                    // Update Date AND Time for single events to prevent "past" jump
                    return {
                        ...r,
                        time: hhmm,
                        startDate: yyyy_mm_dd,
                        date: yyyy_mm_dd, // Legacy support
                        status: 'upcoming'
                    };
                }
                return r;
            });
        }

        save();
        // Trigger generic update event for hooks that don't listen to storage
        window.dispatchEvent(new Event('data-updated'));

        // Fix Snooze Notification Bug: Clear the "Already Notified" flag for this instance
        // so useReminders will see it as "new" when the snoozed time arrives.
        if (instanceKey) {
            window.dispatchEvent(new CustomEvent('clear-notification-ref', { detail: { instanceKey } }));
        }

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
                            updatedAt: now.toISOString(),
                            timestamp: now.toISOString()
                        }
                    };
                    await firestoreService.updateReminder(id, payload);
                } else {
                    const hhmm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                    const yyyy_mm_dd = now.toLocaleDateString('en-CA');
                    await firestoreService.updateReminder(id, {
                        time: hhmm,
                        startDate: yyyy_mm_dd,
                        date: yyyy_mm_dd,
                        status: 'upcoming'
                    });
                }
            } catch (e) {
                console.error("Firestore snooze failed:", e);
            }
        }

    },

    // NEW: Clear duplicate prevention ref in useReminders
    clearNotificationRef: (instanceKey) => {
        window.dispatchEvent(new CustomEvent('clear-notification-ref', { detail: { instanceKey } }));
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
        // OPTIMISTIC: Update local store FIRST (so UI updates immediately)
        if (store.notes) {
            store.notes = store.notes.filter(n => String(n.id) !== String(id));
            save();
            notifyListeners(); // Trigger UI update immediately
        }

        // Then try to delete from Firestore if logged in
        if (auth.currentUser) {
            try {
                await firestoreService.deleteNote(id);
            } catch (err) {
                console.error("Firestore deleteNote failed:", err);
                // Note is already removed from local store, so user sees it gone
                // On next sync, if note still exists in Firestore, it may reappear
                // but for now, the delete action completes successfully from user's perspective
            }
        }
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

    getNote: async (id) => {
        // Try local first? No, we want latest remote for conflict check.
        if (auth.currentUser) {
            return await firestoreService.getNote(id);
        }
        return store.notes.find(n => String(n.id) === String(id)) || null;
    },

    getNoteRealtime: (id, callback) => {
        if (!auth.currentUser) return () => { };
        return firestoreService.getNoteRealtime(id, callback);
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
