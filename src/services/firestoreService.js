import { db, auth, storage } from './firebase';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    collectionGroup,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    addDoc,
    onSnapshot,
    serverTimestamp,
    orderBy,
    writeBatch,
    deleteField,
    limit, // V7 Optimization
    or     // V10: Logic Operator
} from 'firebase/firestore';
import {
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject,
    listAll
} from 'firebase/storage';

export const firestoreService = {

    /**
     * MIGRATION: Push local data to Firestore
     */
    migrateLocalData: async (localData) => {
        const user = auth.currentUser;
        if (!user) return;

        console.log("Starting Migration for user:", user.uid);

        try {
            // 1. Reminders
            if (localData.reminders && localData.reminders.length > 0) {
                const remindersRef = collection(db, 'users', user.uid, 'reminders');
                for (const r of localData.reminders) {
                    // Use ID as doc ID for consistency or auto-id?
                    // Let's use stringified ID to prevent dupes if rerunning
                    const rDoc = doc(remindersRef, String(r.id));
                    await setDoc(rDoc, r, { merge: true }); // V10.29 FIX: Merge to avoid wiping logs
                }
            }

            // 2. Notes (Shared Collection)
            // We put notes in a root collection 'notes' but with ownerId
            if (localData.notes && localData.notes.length > 0) {
                const notesRef = collection(db, 'notes');
                for (const n of localData.notes) {
                    const newNote = {
                        ...n,
                        ownerId: user.uid,
                        // Fix: Preserve sharedWith from local if exists, else default to [] ONLY if undefined
                        sharedWith: n.sharedWith || [],
                        createdAt: n.createdAt || new Date().toISOString()
                    };
                    // Use setDoc with merge: true to avoid overwriting existing cloud data (like sharedWith updates from others)
                    await setDoc(doc(notesRef, String(n.id)), newNote, { merge: true });
                }
            }

            // 3. Caregivers
            if (localData.caregivers && localData.caregivers.length > 0) {
                const cgRef = collection(db, 'users', user.uid, 'caregivers');
                for (const c of localData.caregivers) {
                    const cDoc = doc(cgRef, String(c.id));
                    await setDoc(cDoc, c, { merge: true });
                }
            }

            // 4. Settings
            if (localData.settings) {
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, { settings: localData.settings });
            }

            console.log("Migration Complete");
            return true;
        } catch (e) {
            console.error("Migration Failed", e);
            throw e;
        }
    },

    // --- SETTINGS (NEW) ---
    getSettingsRealtime: (callback) => {
        const user = auth.currentUser;
        if (!user) return () => { };

        const userRef = doc(db, 'users', user.uid);
        return onSnapshot(userRef, (doc) => {
            if (doc.exists() && doc.data().settings) {
                callback(doc.data().settings);
            }
        });
    },

    updateSettings: async (settings) => {
        const user = auth.currentUser;
        if (!user) return;
        const userRef = doc(db, 'users', user.uid);
        // We use setDoc with merge:true to create if not exists or update
        await setDoc(userRef, { settings }, { merge: true });
    },

    getNote: async (noteId) => {
        const user = auth.currentUser;
        if (!user) return null;
        try {
            // Shared notes are in 'notes' collection
            const noteRef = doc(db, 'notes', String(noteId));
            const snap = await getDoc(noteRef);
            if (snap.exists()) return { id: snap.id, ...snap.data() };
            return null;
        } catch (e) {
            console.error("Error fetching note:", e);
            return null;
        }
    },

    deleteAllUserData: async () => {
        const user = auth.currentUser;
        if (!user) return;

        try {
            // Helper for batch deletion
            const deleteInBatches = async (docs) => {
                const BATCH_SIZE = 400;
                for (let i = 0; i < docs.length; i += BATCH_SIZE) {
                    const batch = writeBatch(db);
                    const chunk = docs.slice(i, i + BATCH_SIZE);
                    chunk.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            };

            // Delete Reminders
            const remindersRef = collection(db, 'users', user.uid, 'reminders');
            const remindersSnap = await getDocs(remindersRef);
            await deleteInBatches(remindersSnap.docs);

            // Delete Caregivers
            const caregiversRef = collection(db, 'users', user.uid, 'caregivers');
            const caregiversSnap = await getDocs(caregiversRef);
            await deleteInBatches(caregiversSnap.docs);

            // Delete Notes (Owned)
            const notesQuery = query(collection(db, 'notes'), where('ownerId', '==', user.uid));
            const notesSnap = await getDocs(notesQuery);
            await deleteInBatches(notesSnap.docs);

            // Delete User Settings
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { settings: deleteField() });

            // Delete Storage Files
            try {
                const listRef = ref(storage, `users/${user.uid}/files`);
                const res = await listAll(listRef);
                await Promise.all(res.items.map(item => deleteObject(item)));
            } catch (storageErr) {
                console.warn("Storage cleanup incomplete (might be empty):", storageErr);
            }

            console.log("All user data deleted from cloud.");
        } catch (error) {
            console.error("Error deleting user data:", error);
            throw error;
        }
    },

    // --- REMINDERS ---

    // --- MANUAL FETCH (For Pull-to-Refresh) ---
    fetchReminders: async () => {
        const user = auth.currentUser;
        if (!user) return [];
        const q = collection(db, 'users', user.uid, 'reminders');
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    fetchNotesOwned: async () => {
        const user = auth.currentUser;
        if (!user) return [];
        const q = query(collection(db, 'notes'), where('ownerId', '==', user.uid));
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    fetchNotesShared: async () => {
        const user = auth.currentUser;
        if (!user) return [];
        const q = query(collection(db, 'notes'), where('sharedWith', 'array-contains', user.email));
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    fetchCaregivers: async () => {
        const user = auth.currentUser;
        if (!user) return [];
        const q = collection(db, 'users', user.uid, 'caregivers');
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    fetchSettings: async () => {
        const user = auth.currentUser;
        if (!user) return {};
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        return (snap.exists() && snap.data().settings) ? snap.data().settings : {};
    },

    // --- REMINDERS ---

    getRemindersRealtime: (callback) => {
        const user = auth.currentUser;
        if (!user) return () => { };

        const q = collection(db, 'users', user.uid, 'reminders');
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // View another user's reminders (Caregiver Mode)
    getRemindersForUser: (targetUid, callback) => {
        const q = collection(db, 'users', targetUid, 'reminders');
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    addReminder: async (reminder) => {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        const remindersRef = collection(db, 'users', user.uid, 'reminders');

        // Sanitize payload to remove undefined values
        const sanitized = Object.entries(reminder).reduce((acc, [key, value]) => {
            if (value !== undefined) acc[key] = value;
            return acc;
        }, {});

        const id = String(Date.now());
        const newReminder = { ...sanitized, id, userId: user.uid };

        await setDoc(doc(remindersRef, id), newReminder);
        return newReminder;
    },

    updateReminder: async (id, updates) => {
        const user = auth.currentUser;
        if (!user) return;
        const ref = doc(db, 'users', user.uid, 'reminders', String(id));

        // Sanitize updates
        const sanitizedUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
            if (value !== undefined) acc[key] = value;
            return acc;
        }, {});

        await updateDoc(ref, sanitizedUpdates);
    },

    deleteReminder: async (id) => {
        const user = auth.currentUser;
        if (!user) return;
        const ref = doc(db, 'users', user.uid, 'reminders', String(id));
        await deleteDoc(ref);
    },

    // --- NOTES (Shared) ---

    getNoteRealtime: (noteId, callback) => {
        const user = auth.currentUser;
        if (!user || !noteId) return () => { };
        try {
            const noteRef = doc(db, 'notes', String(noteId));
            return onSnapshot(noteRef, (docSnap) => {
                if (docSnap.exists()) {
                    callback({ id: docSnap.id, ...docSnap.data() });
                }
            });
        } catch (e) {
            console.error("Error setting up note listener:", e);
            return () => { };
        }
    },

    getNotesRealtime: (callback) => {
        const user = auth.currentUser;
        if (!user) return () => { };

        console.log(`[Firestore Debug] getNotesRealtime: user.uid=${user.uid}, user.email=${user.email}`);

        // Maintain separate maps for each query source to handle deletions correctly
        // When a snapshot updates, we REPLACE the map for that source.
        const notesMaps = {
            owner: new Map(),
            user: new Map(),
            email: new Map()
        };

        const updateAndNotify = () => {
            // Merge all maps by ID
            const allNotes = new Map();

            // Priority: Owner > User > Email (though IDs should comprise the same object)
            // We just merge them. If an ID exists in multiple, the last one wins (updates).
            // Since they point to the same doc ID, data should be identical roughly.

            notesMaps.owner.forEach((v, k) => allNotes.set(k, v));
            notesMaps.user.forEach((v, k) => allNotes.set(k, v));
            notesMaps.email.forEach((v, k) => allNotes.set(k, v));

            const uniqueNotes = Array.from(allNotes.values());
            // Client-side sort
            uniqueNotes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            console.log(`[Firestore] Merged Total Notes: ${uniqueNotes.length}`);
            callback(uniqueNotes);
        };

        const notesRef = collection(db, 'notes');

        // 1. Current Schema (ownerId)
        const unsub1 = onSnapshot(query(notesRef, where('ownerId', '==', user.uid), limit(100)), (snap) => {
            const currentMap = new Map();
            snap.docs.forEach(doc => currentMap.set(doc.id, { id: doc.id, ...doc.data() }));
            notesMaps.owner = currentMap;
            updateAndNotify();
        }, (e) => console.error("Error fetching notes (ownerId):", e));

        // 2. Legacy Schema (userId)
        const unsub2 = onSnapshot(query(notesRef, where('userId', '==', user.uid), limit(100)), (snap) => {
            const currentMap = new Map();
            snap.docs.forEach(doc => currentMap.set(doc.id, { id: doc.id, ...doc.data() }));
            notesMaps.user = currentMap;
            updateAndNotify();
        }, (e) => console.error("Error fetching notes (userId):", e));

        // 3. Email-based ownership (for orphan notes that only have ownerEmail)
        const unsub3 = onSnapshot(query(notesRef, where('ownerEmail', '==', user.email), limit(100)), (snap) => {
            const currentMap = new Map();
            snap.docs.forEach(doc => currentMap.set(doc.id, { id: doc.id, ...doc.data() }));
            notesMaps.email = currentMap;
            updateAndNotify();
        }, (e) => console.error("Error fetching notes (ownerEmail):", e));

        return () => {
            unsub1();
            unsub2();
            unsub3();
        };
    },

    // Separate stream for shared notes to avoid complex query issues initially
    getSharedNotesRealtime: (callback) => {
        const user = auth.currentUser;
        if (!user) return () => { };

        // Use 'email' for sharing or 'uid'? 
        // Ideally UID, but user types email. We need to lookup UID or store email in sharedWith.
        // Let's assume we store email in sharedWithEmails for simplicity first?
        // Or store UID if we look it up.
        // Let's use user.email
        if (!user.email) return () => { };

        const notesRef = collection(db, 'notes');
        const qShared = query(notesRef, where('sharedWith', 'array-contains', user.email));

        return onSnapshot(qShared, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isShared: true }));
            callback(data);
        }, (error) => {
            console.error("Error fetching shared notes:", error);
        });
    },

    getNote: async (id) => {
        const docRef = doc(db, 'notes', String(id));
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
            return { id: snapshot.id, ...snapshot.data() };
        }
        return null;
    },

    addNote: async (note) => {
        const user = auth.currentUser;
        if (!user) return;

        // Sanitize: ensure no undefined ID or other fields are passed
        const { id, ...noteData } = note;

        // Helper to remove undefined keys (Firestore rejection fix)
        const sanitizedData = Object.entries(noteData).reduce((acc, [key, value]) => {
            if (value !== undefined) acc[key] = value;
            return acc;
        }, {});

        const newNote = {
            ...sanitizedData,
            ownerId: user.uid,
            ownerEmail: user.email,
            createdAt: note.createdAt || new Date().toISOString()
        };

        // FIX: Only set sharedWith if explicitly provided to prevent overwriting with atomic updates or stale data
        if (note.sharedWith !== undefined) {
            newNote.sharedWith = note.sharedWith;
        } else if (!note.id) {
            // New note default
            newNote.sharedWith = [];
        }

        // If ID provided (from offline draft or pre-generation), use it with setDoc
        if (note.id) {
            // FIX: Use merge: true to avoid wiping fields like sharedWith if not provided or if this is a partial upsert
            await setDoc(doc(db, 'notes', String(note.id)), newNote, { merge: true });
            return { ...newNote, id: note.id };
        } else {
            const ref = await addDoc(collection(db, 'notes'), newNote);
            return { ...newNote, id: ref.id };
        }
    },

    updateNote: async (id, updates) => {
        // Warning: minimal security here for demo. Validation rules should enforce ownership.
        const ref = doc(db, 'notes', String(id));
        const user = auth.currentUser;

        // Extra safety: Remove restricted keys if present
        // eslint-disable-next-line no-unused-vars
        const { ownerId, ownerEmail, ...safeUpdates } = updates;

        // Remove undefined keys (Firestore rejection fix)
        Object.keys(safeUpdates).forEach(key => safeUpdates[key] === undefined && delete safeUpdates[key]);

        try {
            await updateDoc(ref, safeUpdates);
        } catch (e) {
            // Fallback for "Offline Created" or "Sync Gap" notes (Upsert)
            // also catch 'permission-denied' because Rules fail on 'resource.data' access if doc missing
            if (user && (e.code === 'not-found' || e.code === 'permission-denied' || e.message?.includes('No document to update') || e.message?.includes('Missing or insufficient permissions'))) {
                console.warn("Note update failed (missing/perm), recreating (Upsert):", id);
                const recreatePayload = {
                    ...updates,
                    id: String(id), // Ensure ID string
                    ownerId: user.uid, // Required for 'create' rule
                    ownerEmail: user.email,
                    createdAt: updates.createdAt || new Date().toISOString()
                };
                // Ensure safeUpdates + Critical Fields
                await setDoc(ref, recreatePayload, { merge: true });
            } else {
                throw e;
            }
        }
    },

    reorderNotes: async (orderedIds) => {
        const user = auth.currentUser;
        if (!user) return;

        const batch = writeBatch(db);
        orderedIds.forEach((noteId, index) => {
            const ref = doc(db, 'notes', String(noteId));
            batch.update(ref, { order: index });
        });
        await batch.commit();
    },

    deleteNote: async (id) => {
        const ref = doc(db, 'notes', String(id));

        // DEBUG: Fetch doc to see why delete fails
        try {
            const docSnap = await getDoc(ref);
            if (docSnap.exists()) {
                console.log(`[Firestore DEBUG] Attempting to delete note ${id}. Data:`, docSnap.data());
                console.log(`[Firestore DEBUG] Current User: uid=${auth.currentUser?.uid}, email=${auth.currentUser?.email}`);
            } else {
                console.warn(`[Firestore DEBUG] Note ${id} does not exist before delete.`);
            }
        } catch (e) {
            console.error("[Firestore DEBUG] Failed to fetch note before delete:", e);
        }

        await deleteDoc(ref);
    },

    shareNote: async (noteId, email) => {
        const ref = doc(db, 'notes', String(noteId));
        // We need arrayUnion
        const { arrayUnion } = await import('firebase/firestore');
        await updateDoc(ref, {
            sharedWith: arrayUnion(email)
        });
    },

    unshareNote: async (noteId, email) => {
        const ref = doc(db, 'notes', String(noteId));
        const { arrayRemove } = await import('firebase/firestore');
        await updateDoc(ref, {
            sharedWith: arrayRemove(email)
        });
    },

    // --- CAREGIVERS ---

    getCaregiversRealtime: (callback) => {
        const user = auth.currentUser;
        if (!user) return () => { };

        const q = collection(db, 'users', user.uid, 'caregivers');
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    addCaregiver: async (caregiver) => {
        const user = auth.currentUser;
        if (!user) return;
        const id = String(Date.now());
        const ref = doc(db, 'users', user.uid, 'caregivers', id);

        // Normalize email to lowercase
        const payload = {
            ...caregiver,
            email: caregiver.email ? caregiver.email.toLowerCase() : '',
            id
        };
        await setDoc(ref, payload);
    },

    deleteCaregiver: async (id) => {
        const user = auth.currentUser;
        if (!user) return;
        const ref = doc(db, 'users', user.uid, 'caregivers', String(id));
        await deleteDoc(ref);
    },

    updateCaregiver: async (id, updates) => {
        const user = auth.currentUser;
        if (!user) return;
        const ref = doc(db, 'users', user.uid, 'caregivers', String(id));
        await updateDoc(ref, updates);
    },

    // --- PATIENT DISCOVERY (For Caregivers) ---

    // Find who has listed ME (by email) as a caregiver
    getPatientsForCaregiver: async (myEmail) => {
        if (!myEmail) return [];
        const emailToQuery = myEmail.toLowerCase();
        try {
            // "Who has added 'myEmail' to their 'caregivers' subcollection?"
            const q = query(collectionGroup(db, 'caregivers'), where('email', '==', emailToQuery));
            const snapshot = await getDocs(q);

            // Map to Patient IDs (Parent of the caregiver doc is 'caregivers', Parent of that is the User/Patient)
            const patients = [];

            // We need to fetch the PATIENT'S details (the parent User doc), 
            // otherwise we just show the Caregiver's own name (from the relationship doc).
            const promises = snapshot.docs.map(async (d) => {
                const patientUid = d.ref.parent.parent?.id;
                if (patientUid) {
                    try {
                        const patientDocRef = doc(db, 'users', patientUid);
                        const patientSnap = await getDoc(patientDocRef);
                        const patientData = patientSnap.exists() ? patientSnap.data() : {};

                        return {
                            uid: patientUid,
                            caregiverDocId: d.id,
                            relationship: {
                                ...d.data(), // Role, isEmergency, etc.
                                // OVERRIDE name/email with the PATIENT'S info for display
                                name: patientData.displayName || 'Unnamed Patient',
                                email: patientData.email || 'No Email'
                            }
                        };
                    } catch (e) {
                        console.error("Error fetching patient details:", e);
                        return null;
                    }
                }
                return null;
            });

            const results = await Promise.all(promises);
            // Filter out nulls
            return results.filter(p => p !== null);
        } catch (error) {
            console.error("Error finding patients:", error);
            throw error; // UI handles this
        }
    },

    // Read-Only Access to Patient Data
    getPatientRemindersRealtime: (patientUid, callback) => {
        const q = collection(db, 'users', patientUid, 'reminders');
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        }, (error) => {
            console.error("Access Denied to Patient Data:", error);
            callback([]); // Return empty if permission denied
        });
    }
};
