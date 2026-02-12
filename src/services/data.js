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
        theme: 'system',
        notificationSound: 'standard' // 'standard' | 'alarm'
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

// Track locally deleted note IDs to prevent re-sync
const DELETED_IDS_KEY = 'remindme_deleted_ids';
const loadDeletedIds = () => {
    try {
        const stored = localStorage.getItem(DELETED_IDS_KEY);
        return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (e) {
        return new Set();
    }
};
let deletedNoteIds = loadDeletedIds();

const saveDeletedIds = () => {
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(deletedNoteIds)));
};

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
            // A. Fetch cloud-stored deleted note IDs (MOVED UP to prevent resurrection)
            try {
                const cloudDeletedIds = await firestoreService.fetchDeletedNoteIds();
                if (cloudDeletedIds && cloudDeletedIds.length > 0) {
                    cloudDeletedIds.forEach(id => deletedNoteIds.add(String(id)));
                    saveDeletedIds();
                    console.log(`Loaded ${cloudDeletedIds.length} deleted note IDs from cloud BEFORE MIGRATION.`);
                }
            } catch (e) {
                console.warn("Failed to fetch cloud deleted IDs", e);
            }

            // A2. Initial Migration (Push local to cloud ONLY ONCE per user)
            const migrationKey = `remindme_migrated_${uid}`;
            const alreadyMigrated = localStorage.getItem(migrationKey);

            // Filter out deleted notes from migration candidacy
            const localNotesCandidates = (store.notes || []).filter(n => !deletedNoteIds.has(String(n.id)));
            const hasNotesToMigrate = localNotesCandidates.length > 0;

            if (!alreadyMigrated && ((store.reminders && store.reminders.length > 0) || hasNotesToMigrate)) {
                console.log("First login: Migrating local cache to Cloud...");

                // V10: Ensure ownerId is attached to all migrated data
                const sanitizedStore = { ...store };
                if (sanitizedStore.reminders) {
                    sanitizedStore.reminders = sanitizedStore.reminders.map(r => ({ ...r, ownerId: uid, ownerEmail: auth.currentUser?.email }));
                }
                if (sanitizedStore.notes) {
                    // Use filtered list
                    sanitizedStore.notes = localNotesCandidates.map(n => ({ ...n, ownerId: uid, ownerEmail: auth.currentUser?.email }));
                }

                try {
                    await firestoreService.migrateLocalData(sanitizedStore);
                    localStorage.setItem(migrationKey, 'true');
                    console.log("Migration complete. Flag set.");
                } catch (e) {
                    console.error("Sync-up failed", e);
                }
            } else if (alreadyMigrated) {
                console.log("Migration already done for this user. Skipping.");
            }

            // B. Setup Realtime Listeners (Pull cloud to local)
            console.log("Setting up Realtime Sync for:", uid);

            // Reminders Listener — Route through syncFromCloud for smart merge
            const unsubReminders = firestoreService.getRemindersRealtime((reminders) => {
                dataService.syncFromCloud('reminders', reminders);
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

                // V10.36 FIX: Filter out locally deleted notes to prevent re-sync
                // This prevents "zombie notes" from reappearing if Firestore delete is pending/failed
                const validNotes = notes.filter(n => !deletedNoteIds.has(String(n.id)));

                // V10.25 FIX: Preserver SHARED notes when updating owned notes
                // Current store has [Owned + Shared]. 'notes' is just [Owned].
                const currentShared = (store.notes || []).filter(n => n.isShared);

                // Deduplicate in case 'notes' (Owned) somehow includes Shared (unlikely but safe)
                const newOwnedMap = new Map();

                // SMART MERGE: Cloud wins for CONTENT, local wins only for UI state (isPinned)
                // This prevents stale local cache from overwriting newer cloud data
                validNotes.forEach(cloudNote => {
                    const localNote = store.notes.find(n => n.id === cloudNote.id);
                    if (localNote) {
                        const localTime = localNote.updatedAt ? new Date(localNote.updatedAt).getTime() : 0;
                        const cloudTime = cloudNote.updatedAt ? new Date(cloudNote.updatedAt).getTime() : 0;
                        const nowMs = Date.now();
                        const recentEditThreshold = 5000; // 5 second window for in-flight local edits

                        if (localTime > cloudTime && (nowMs - localTime) < recentEditThreshold) {
                            // Local edit is very recent (within 5s) — keep local to avoid clobbering
                            // an in-flight Firestore write that hasn't round-tripped yet
                            newOwnedMap.set(cloudNote.id, { ...cloudNote, ...localNote });
                        } else {
                            // Cloud wins for content, but preserve local-only UI state
                            newOwnedMap.set(cloudNote.id, {
                                ...cloudNote,
                                isPinned: localNote.isPinned ?? cloudNote.isPinned
                            });
                        }
                    } else {
                        newOwnedMap.set(cloudNote.id, cloudNote);
                    }
                });

                // Add shared back if not in newOwned which overrides shared if ID collision
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
                // Filter locally deleted shared notes
                const validShared = sharedNotes.filter(n => !deletedNoteIds.has(String(n.id)));

                // Merge Shared into Store
                // We need to avoid duplicates if a note is both owned and shared (unlikely).
                // We also need to avoid overwriting owned notes when shared update comes.
                // current store.notes has OWNED notes (from above).
                // We should append SHARED notes.
                const owned = store.notes.filter(n => !n.isShared);

                // Deduplicate by ID just in case
                const sharedMap = new Map();

                // SMART MERGE for Shared Notes: Cloud wins for content, local for UI state
                validShared.forEach(cloudNote => {
                    const localNote = store.notes.find(n => n.id === cloudNote.id);
                    if (localNote) {
                        const localTime = localNote.updatedAt ? new Date(localNote.updatedAt).getTime() : 0;
                        const cloudTime = cloudNote.updatedAt ? new Date(cloudNote.updatedAt).getTime() : 0;
                        const nowMs = Date.now();
                        const recentEditThreshold = 5000;

                        if (localTime > cloudTime && (nowMs - localTime) < recentEditThreshold) {
                            sharedMap.set(cloudNote.id, { ...cloudNote, ...localNote });
                        } else {
                            sharedMap.set(cloudNote.id, {
                                ...cloudNote,
                                isPinned: localNote.isPinned ?? cloudNote.isPinned
                            });
                        }
                    } else {
                        sharedMap.set(cloudNote.id, cloudNote);
                    }
                });

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
        else if (type === 'notes') {
            // ROBUST SMART MERGE for Notes: Field-Level Merging to prevent data loss
            // Filter out locally deleted notes first
            const validCloudNotes = data.filter(n => !deletedNoteIds.has(String(n.id)));
            const localNotes = store.notes || [];

            const mergedMap = new Map();

            validCloudNotes.forEach(cloudNote => {
                const localNote = localNotes.find(n => String(n.id) === String(cloudNote.id));

                if (localNote) {
                    const localTime = localNote.updatedAt ? new Date(localNote.updatedAt).getTime() : 0;
                    const cloudTime = cloudNote.updatedAt ? new Date(cloudNote.updatedAt).getTime() : 0;

                    // CONFLICT DETECTION:
                    // If content differs AND widely different timestamps (handled by logic below)

                    // 1. PINNED STATUS: Local UI state wins if set, else Cloud
                    const mergedPinned = localNote.isPinned ?? cloudNote.isPinned;

                    // 2. CONTENT MERGE
                    let mergedContent = cloudNote.content;
                    let mergedItems = cloudNote.items;
                    let mergedFiles = cloudNote.files;
                    let mergedAudio = cloudNote.audioData;
                    let mergedType = cloudNote.type;
                    let mergedUpdatedAt = cloudNote.updatedAt;

                    // If Local is NEWER -> potentially keep Local, but we want to merge if Cloud also changed from what Local knew (hard to track base).
                    // SIMPLIFIED ROBUST STRATEGY: 
                    // If Local is newer, we normally trust it. 
                    // BUT if Cloud is also "newish" (implying concurrency), we might overwrite.
                    // The safest bet for Offline safety:
                    // If Local > Cloud, Keep Local BUT append Cloud content if different (to be safe).
                    // Actually, if Local > Cloud, it means Local was edited *after* the Cloud version was saved.
                    // So usually Local matches the user's latest intent.
                    // THE DANGER: User edits on Device A (offline), Device B syncs to Cloud. Device A acts.
                    // Local time > Cloud time? Maybe.

                    // User Request: "Local should store on local storage but it should merge with cloud as well. It should never happen that (old data appears)."
                    // User also approved the plan: "Text: Concatenate".

                    // MERGE LOGIC:
                    // Only merge if content is DIFFERENT.
                    const isContentDifferent = localNote.content !== cloudNote.content;
                    const isItemsDifferent = JSON.stringify(localNote.items) !== JSON.stringify(cloudNote.items);

                    if (localTime >= cloudTime) {
                        // Local is newer (or equal). Local takes precedence, but we append Cloud if distinct to be safe?
                        // Actually, if Local is newer, it likely supposedly overrides Cloud.
                        // BUT if we want "Robust Merge (Concatenate)", we do it if Cloud is *also* recent? 
                        // Let's assume strict merge for SAFETY.

                        mergedContent = localNote.content;
                        mergedItems = localNote.items;
                        mergedFiles = localNote.files;
                        mergedAudio = localNote.audioData;
                        mergedType = localNote.type;
                        mergedUpdatedAt = localNote.updatedAt;

                        // DATA RECOVERY: If Cloud has textual content that is NOT in Local (and not just an old version), append it.
                        // Heuristic: If Cloud content is long and significantly different, append it as a "Conflict Copy".
                        // To avoid annoying duplication of just "fixed a typo", we can check Levenshtein or just simple "contains".
                        // Use simple strategy: If both exist and different -> Concatenate.
                        if (cloudNote.content && localNote.content && isContentDifferent && !localNote.content.includes(cloudNote.content)) {
                            mergedContent = `${localNote.content}\n\n--- [Synced Version] ---\n${cloudNote.content}`;
                        }

                        // Merge Lists (Union)
                        if (localNote.type === 'shopping' && cloudNote.type === 'shopping' && cloudNote.items) {
                            // Create map by text matching
                            const itemMap = new Map();
                            (localNote.items || []).forEach(i => itemMap.set(i.text.trim().toLowerCase(), i));
                            (cloudNote.items || []).forEach(i => {
                                const key = i.text.trim().toLowerCase();
                                if (!itemMap.has(key)) {
                                    itemMap.set(key, i); // Add missing cloud items
                                } else {
                                    // If both have it, keep the one that is 'done' if either is done? Or trust local?
                                    // Trust Local (Newer)
                                }
                            });
                            mergedItems = Array.from(itemMap.values());
                        }

                        // Merge Files (Union by URL/Data)
                        if (cloudNote.files && cloudNote.files.length > 0) {
                            const existingUrls = new Set((localNote.files || []).map(f => f.url || f.data)); // Naive dedup
                            const newFiles = [...(localNote.files || [])];
                            cloudNote.files.forEach(f => {
                                if (!existingUrls.has(f.url || f.data)) {
                                    newFiles.push(f);
                                }
                            });
                            mergedFiles = newFiles;
                        }

                    } else {
                        // Cloud is NEWER. Normally Cloud wins.
                        // BUT valid offline changes might be present in Local (with older TS if clock skew? Or just overwritten).
                        // Actually, if Cloud is newer, we normally accept it. 
                        // RECOVERY: If Local has content not in Cloud, keep it.

                        mergedContent = cloudNote.content;
                        mergedItems = cloudNote.items;
                        mergedFiles = cloudNote.files;
                        mergedAudio = cloudNote.audioData;
                        mergedType = cloudNote.type;
                        mergedUpdatedAt = cloudNote.updatedAt;

                        if (localNote.content && cloudNote.content && isContentDifferent && !cloudNote.content.includes(localNote.content)) {
                            mergedContent = `${cloudNote.content}\n\n--- [Local Unsynced] ---\n${localNote.content}`;
                        }

                        // Merge Lists
                        if (cloudNote.type === 'shopping' && localNote.type === 'shopping' && localNote.items) {
                            const itemMap = new Map();
                            (cloudNote.items || []).forEach(i => itemMap.set(i.text.trim().toLowerCase(), i));
                            (localNote.items || []).forEach(i => {
                                const key = i.text.trim().toLowerCase();
                                if (!itemMap.has(key)) {
                                    itemMap.set(key, i);
                                }
                            });
                            mergedItems = Array.from(itemMap.values());
                        }

                        // Merge Files
                        if (localNote.files && localNote.files.length > 0) {
                            const existingUrls = new Set((cloudNote.files || []).map(f => f.url || f.data));
                            const newFiles = [...(cloudNote.files || [])];
                            localNote.files.forEach(f => {
                                if (!existingUrls.has(f.url || f.data)) {
                                    newFiles.push(f);
                                }
                            });
                            mergedFiles = newFiles;
                        }
                    }

                    mergedMap.set(String(cloudNote.id), {
                        ...cloudNote, // Base properties
                        ...localNote, // Overlay Local properties? NO.
                        // Construct carefully
                        content: mergedContent,
                        items: mergedItems,
                        files: mergedFiles,
                        audioData: mergedAudio, // Date-based winner logic was applied implicitly by choosing base note
                        type: mergedType,
                        updatedAt: mergedUpdatedAt, // ISO String
                        isPinned: mergedPinned
                    });

                } else {
                    mergedMap.set(String(cloudNote.id), cloudNote);
                }
            });

            // Preserve local-only notes (Offline Created)
            localNotes.forEach(localNote => {
                // If not in cloud AND not deleted
                if (!mergedMap.has(String(localNote.id)) && !deletedNoteIds.has(String(localNote.id))) {
                    // Safe to keep. 
                    // No "10s threshold" needed anymore because we trust local creation unless deleted.
                    mergedMap.set(String(localNote.id), localNote);
                }
            });

            store.notes = Array.from(mergedMap.values()).map(n => ({
                ...n,
                isPinned: !!n.isPinned
            }));

            // Sort by createdAt descending
            store.notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
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

    // Reminders - with deduplication to prevent duplicates in Reports
    getReminders: () => {
        const reminders = getCurrentStore().reminders || [];
        // Deduplicate by ID - keep first occurrence
        const unique = new Map();
        reminders.forEach(r => {
            if (r.id && !unique.has(String(r.id))) {
                unique.set(String(r.id), r);
            }
        });
        return Array.from(unique.values());
    },

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

        all.forEach(r => {
            // Universal Start Date & Duration Logic
            const univSchedule = r.schedule || {};
            const univStart = univSchedule.startDate || r.date || '2000-01-01';

            if (dateString < univStart) return;

            if (univSchedule.durationDays) {
                const start = new Date(univStart);
                const current = new Date(dateString);
                const diffInDays = Math.ceil((current - start) / (1000 * 60 * 60 * 24));
                if (diffInDays < 0) return;
                if (diffInDays >= univSchedule.durationDays) return;
            }
            if (univSchedule.endDate) {
                if (dateString > univSchedule.endDate) return;
            }

            // 1. Handle Complex Schedules (Medication)
            if (r.schedule && r.schedule.type === 'recurring') {
                const startStr = r.schedule.startDate;
                if (dateString < startStr) return;

                const diffDays = getHealthDiffDays(startStr, dateString);

                if (diffDays >= 0 && (r.schedule.durationDays ? diffDays < r.schedule.durationDays : true)) {
                    const times = r.schedule.times || {};
                    Object.entries(times).forEach(([period, time]) => {
                        if (!r.schedule.frequency.includes(period)) return;

                        let instanceKey = `${dateString}_period_${period}`;

                        // Check for EXCEPTION (Edit Instance)
                        const exception = (r.exceptions || {})[instanceKey];
                        if (exception && exception.status === 'cancelled') return;

                        let displayTime = exception?.time || time;
                        let checkDateTime = new Date(dateString);
                        if (displayTime && displayTime.includes(':')) {
                            const [th, tm] = displayTime.split(':').map(Number);
                            checkDateTime.setHours(th, tm, 0, 0);
                        }

                        // Log Logic
                        const log = (r.logs || {})[instanceKey];
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

                        // STRICT STATUS LOGIC
                        let status = 'upcoming';
                        const now = new Date();
                        const twoHoursMs = 2 * 60 * 60 * 1000;
                        const diff = now.getTime() - checkDateTime.getTime();

                        if (log && log.status === 'taken') status = 'taken';
                        else if (log && log.status === 'missed') status = 'missed';
                        else if (log && log.status === 'snoozed') {
                            // SNOOZE FUTURE CHECK
                            const snoozedDate = new Date(checkDateTime);
                            snoozedDate.setHours(0, 0, 0, 0);
                            const targetDateObj = new Date(dateString);
                            targetDateObj.setHours(0, 0, 0, 0);

                            if (snoozedDate > targetDateObj) {
                                return; // Hidden from today
                            }
                            if (diff < twoHoursMs) status = 'snoozed';
                            else status = 'missed';
                        }
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
                            ...exception,
                            uniqueId: `${r.id}_${instanceKey}`,
                            instanceKey: instanceKey,
                            time: displayTime,
                            originalTime: time,
                            displayTime: displayTime,
                            period: period,
                            status: status,
                            takenAt: log ? log.takenAt : null,
                            isVirtual: true,
                            targetDate: dateString
                        });
                    });
                }
            }
            // 2. Handle Simple/Legacy Reminders
            else {
                let times = [];

                if (r.frequency?.startsWith('Every')) {
                    // Hourly / Interval Logic
                    const match = r.frequency.match(/Every\s+(\d+)\s*(h|hour|hours)?/i);
                    const intervalHours = match ? parseInt(match[1]) : NaN;

                    if (!isNaN(intervalHours)) {
                        let startH, startM;
                        const startDateStr = r.schedule?.startDate || r.date;
                        const isStratDate = startDateStr === dateString;

                        if (isStratDate && r.time) {
                            [startH, startM] = r.time.split(':').map(Number);
                        } else if (r.startTime) {
                            [startH, startM] = r.startTime.split(':').map(Number);
                        } else {
                            [startH, startM] = sleepEnd.split(':').map(Number);
                        }

                        const [limitH, limitM] = r.endTime ? r.endTime.split(':').map(Number) : sleepStart.split(':').map(Number);
                        let currentMinutes = startH * 60 + startM;
                        let limitMinutes = limitH * 60 + limitM;

                        if (limitMinutes < currentMinutes) limitMinutes += 24 * 60;
                        if (limitMinutes - currentMinutes > 24 * 60) limitMinutes = currentMinutes + 24 * 60;

                        const step = intervalHours * 60;
                        if (step > 0) {
                            while (currentMinutes <= limitMinutes) {
                                let h = Math.floor(currentMinutes / 60);
                                const m = currentMinutes % 60;
                                if (h >= 24) h -= 24;
                                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                times.push(timeStr);
                                currentMinutes += step;
                            }
                        }
                    }
                } else {
                    // STANDARD SINGLE / DAILY
                    if (r.id) {
                        // Check frequency
                        if (!r.frequency || r.frequency === 'Once') {
                            if (r.date === dateString) {
                                times.push(r.time || '09:00');
                            }
                        } else {
                            // Daily/Weekly/etc
                            // Simplified check: assume 'Daily' for now if not 'Once' and not 'Every'
                            // Real app likely has day check. 
                            // Assuming daily for simple migration or existing logic:
                            times.push(r.time || '09:00');
                        }
                    }
                }

                // PROCESS NATURAL INSTANCES (Legacy Loop)
                times.forEach(time => {
                    // CRITICAL FIX V5.4: Key Format Standardization
                    let instanceKey = `${dateString}_${time || 'default'}`;
                    const [y, m, d] = dateString.split('-').map(Number);
                    const legacyDates = [
                        `${m}/${d}/${y}`, `${d}/${m}/${y}`,
                        `${m}/${d}/${String(y).slice(-2)}`, `${d}/${m}/${String(y).slice(-2)}`
                    ];

                    let checkKeys = [instanceKey, `${dateString}_time_${time || 'default'}`];
                    legacyDates.forEach(ld => {
                        checkKeys.push(`${ld}_${time || 'default'}`);
                        checkKeys.push(`${ld}_time_${time || 'default'}`);
                    });

                    let log, exception;
                    for (const k of checkKeys) {
                        if ((r.logs || {})[k]) { log = r.logs[k]; instanceKey = k; break; }
                        if ((r.exceptions || {})[k]) { exception = r.exceptions[k]; instanceKey = k; break; }
                    }

                    if (exception && exception.status === 'cancelled') return;
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
                        // SNOOZE CHECK
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
                    else if (r.status === 'done' && !log && r.frequency === 'Once') status = 'taken';
                    else if (log && log.status === 'snoozed') {
                        const snoozedDate = new Date(checkDateTime);
                        snoozedDate.setHours(0, 0, 0, 0);
                        const targetDateObj = new Date(dateString);
                        targetDateObj.setHours(0, 0, 0, 0);

                        if (snoozedDate > targetDateObj) {
                            return;
                        }
                        if (diff < twoHoursMs) status = 'snoozed';
                        else status = 'missed';
                    }
                    else if (diff > twoHoursMs) status = 'missed';
                    else status = 'upcoming';

                    // Future safety
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const dObj = new Date(dateString);
                    dObj.setHours(0, 0, 0, 0);
                    if (dObj > today && status === 'missed') status = 'upcoming';

                    let takenAt = log ? log.takenAt : null;

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
                        isMovedIn: false,
                        targetDate: dateString
                    });
                });
            }

            // CRITICAL FIX Phase 3: Check for instances snoozed TO this date (from past dates)
            if (r.logs) {
                Object.entries(r.logs).forEach(([key, log]) => {
                    const originalDate = key.split('_')[0];
                    if (originalDate === dateString) return;

                    if (log.status === 'snoozed' && log.snoozedUntil) {
                        let snoozedDateStr = '';
                        let displayTime = '';
                        if (log.snoozedUntil.includes('T')) {
                            const d = new Date(log.snoozedUntil);
                            snoozedDateStr = d.toLocaleDateString('en-CA');
                            displayTime = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                        } else {
                            return;
                        }

                        if (snoozedDateStr === dateString) {
                            const alreadyExists = expanded.some(item => item.instanceKey === key);
                            if (alreadyExists) return;

                            expanded.push({
                                ...r,
                                uniqueId: `${r.id}_${key}`,
                                instanceKey: key,
                                displayTime: displayTime,
                                status: 'snoozed',
                                takenAt: null,
                                isVirtual: true,
                                isMovedIn: true,
                                targetDate: dateString,
                                time: displayTime,
                                title: `(Snoozed) ${r.title}`
                            });
                        }
                    }
                });
            }

            // CRITICAL FIX Phase 2: Check for instances moved TO this date (from other dates)
            if (r.exceptions) {
                Object.entries(r.exceptions).forEach(([key, ex]) => {
                    if (ex.date === dateString) {
                        const alreadyExists = expanded.some(item => item.instanceKey === key);
                        if (alreadyExists) return;

                        const log = (r.logs || {})[key];
                        let displayTime = ex.time;
                        let checkDateTime = new Date(dateString);
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
                        else if (log && log.status === 'snoozed') status = 'snoozed';
                        else if (diff > twoHoursMs) status = 'missed';
                        else status = 'upcoming';

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dObj = new Date(dateString);
                        dObj.setHours(0, 0, 0, 0);
                        if (dObj > today && status === 'missed') status = 'upcoming';

                        let takenAt = log ? log.takenAt : null;

                        expanded.push({
                            ...r,
                            ...ex,
                            files: (ex.files && ex.files.length > 0) ? ex.files : (r.files || []),
                            uniqueId: `${r.id}_${key}`,
                            instanceKey: key,
                            displayTime: displayTime,
                            status: status,
                            takenAt: takenAt,
                            isVirtual: true,
                            isMovedIn: true,
                            targetDate: dateString
                        });
                    }
                });
            }
        });

        // Deduplicate by uniqueId - keep the first occurrence (prevents Missed+Completed duplicates)
        // SMART DEDUPLICATION: Merge entries with same Title + Time + Date
        // Priority: Taken > Snoozed > Missed > Upcoming
        const smartMap = new Map();
        const getPriority = (status) => {
            if (status === 'taken') return 3;
            if (status === 'snoozed') return 2;
            if (status === 'missed') return 1;
            return 0; // upcoming
        };

        expanded.forEach(e => {
            // Create a logical key based on content, not just ID
            const logicalKey = `${e.title || 'Untitled'}_${e.displayTime || '00:00'}_${e.targetDate}`;

            if (!smartMap.has(logicalKey)) {
                smartMap.set(logicalKey, e);
            } else {
                const existing = smartMap.get(logicalKey);
                const existingPriority = getPriority(existing.status);
                const newPriority = getPriority(e.status);

                // If new one has higher priority (e.g. Taken vs Missed), replace it
                if (newPriority > existingPriority) {
                    smartMap.set(logicalKey, e);
                }
                // If same priority, maybe keep the one with an ID or more data? 
                // For now, first wins if same priority (usually fine)
            }
        });

        const deduped = Array.from(smartMap.values());

        // Sort by time
        return deduped.sort((a, b) => {
            if (!a.displayTime) return 1;
            if (!b.displayTime) return -1;
            return a.displayTime.localeCompare(b.displayTime);
        });
    },
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

            // CRITICAL: Save and notify immediately for UI refresh
            save();

            // Update Firestore for exception
            if (auth.currentUser) {
                const payload = {};
                Object.keys(updates).forEach(k => {
                    payload[`exceptions.${instanceKey}.${k}`] = updates[k];
                });
                payload[`exceptions.${instanceKey}.isException`] = true;
                payload[`exceptions.${instanceKey}.updatedAt`] = new Date().toISOString();

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
        const nowIso = new Date().toISOString();
        const newNote = {
            ...note,
            id,
            createdAt: note.createdAt || nowIso,
            updatedAt: nowIso
        };

        // Remove from deletedNoteIds if re-creating with same ID
        deletedNoteIds.delete(String(id));
        saveDeletedIds();

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
        const targetStore = getCurrentStore();
        const nowIso = new Date().toISOString();
        const optimisticUpdates = { ...updates, updatedAt: nowIso };

        // 1. Update Local / Cache
        if (targetStore.notes) {
            targetStore.notes = targetStore.notes.map(n => String(n.id) === String(id) ? { ...n, ...optimisticUpdates } : n);
            if (!activeProfile) save(); // Only save to local storage if it's my data
            notifyListeners();
        }

        // 2. Update Cloud
        if (auth.currentUser) {
            try {
                // eslint-disable-next-line no-unused-vars
                const { ownerId, createdAt, ownerEmail, ...cleanUpdates } = optimisticUpdates;
                // Remove undefined values
                Object.keys(cleanUpdates).forEach(key => cleanUpdates[key] === undefined && delete cleanUpdates[key]);

                await firestoreService.updateNote(id, cleanUpdates);
            } catch (e) {
                console.error("Firestore updateNote failed:", e);
            }
        }
    },

    deleteNote: async (id) => {
        // Track deleted ID to prevent re-sync from cloud
        deletedNoteIds.add(String(id));
        saveDeletedIds();

        const targetStore = getCurrentStore();

        // OPTIMISTIC: Update local store FIRST (so UI updates immediately)
        if (targetStore.notes) {
            targetStore.notes = targetStore.notes.filter(n => String(n.id) !== String(id));
            if (!activeProfile) save(); // Only save if local
            notifyListeners(); // Trigger UI update immediately
        }

        // Then try to delete from Firestore if logged in
        if (auth.currentUser) {
            try {
                // Delete the note document AND persist deletion record for cross-device sync
                await Promise.all([
                    firestoreService.deleteNote(id),
                    firestoreService.saveDeletedNoteId(String(id))
                ]);
            } catch (err) {
                console.error("Firestore deleteNote failed:", err);
                // Still try to save the deletion record even if the doc delete failed
                try { await firestoreService.saveDeletedNoteId(String(id)); } catch (e) { /* silent */ }
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
            (n.items && n.items.some(i => checkMatch(i.text))) ||
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
