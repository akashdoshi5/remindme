import { db, auth, storage } from './firebase';
import {
    collection,
    doc,
    setDoc,
    getDoc,
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
    deleteField
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
                    await setDoc(rDoc, r);
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
                        sharedWith: [],
                        createdAt: n.createdAt || new Date().toISOString()
                    };
                    // Use setDoc with existing ID to prevent duplicates (idempotent)
                    await setDoc(doc(notesRef, String(n.id)), newNote);
                }
            }

            // 3. Caregivers
            if (localData.caregivers && localData.caregivers.length > 0) {
                const cgRef = collection(db, 'users', user.uid, 'caregivers');
                for (const c of localData.caregivers) {
                    const cDoc = doc(cgRef, String(c.id));
                    await setDoc(cDoc, c);
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

    getNotesRealtime: (callback) => {
        const user = auth.currentUser;
        if (!user) return () => { };

        // Query: My notes OR Notes shared with me
        // Firestore OR queries are separate. We can query 'ownerId' == uid
        // AND 'sharedWith' array-contains uid
        // But we need to merge.

        const notesRef = collection(db, 'notes');
        const qOwned = query(notesRef, where('ownerId', '==', user.uid));

        // Setup listener for OWNED
        const unsubscribeOwned = onSnapshot(qOwned, (snapOwned) => {
            let ownedNotes = snapOwned.docs.map(d => ({ id: d.id, ...d.data() }));

            // Client-side sort by 'order' since we don't have composite index set up yet
            ownedNotes.sort((a, b) => (a.order || 0) - (b.order || 0));

            // Setup listener for SHARED (nested to merge? No, better separate state management in UI, 
            // but for simple service API we might need to combine manually or expose two streams)

            // For now, let's just return owned. User asked for shared notes to be visible.
            // Let's try Filter.or if SDK supports it (v9 does).
            // But 'array-contains' and '==' on different fields might require composite index.

            callback(ownedNotes); // Temporary: only owned
        }, (error) => {
            console.error("Error fetching owned notes:", error);
        });

        return unsubscribeOwned;
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
            createdAt: new Date().toISOString(),
            sharedWith: [] // Array of emails
        };

        // If ID provided (from offline draft or pre-generation), use it with setDoc (Upsert-ish)
        if (note.id) {
            await setDoc(doc(db, 'notes', String(note.id)), newNote);
            return { ...newNote, id: note.id };
        } else {
            const ref = await addDoc(collection(db, 'notes'), newNote);
            return { ...newNote, id: ref.id };
        }
    },

    updateNote: async (id, updates) => {
        // Warning: minimal security here for demo. Validation rules should enforce ownership.
        const ref = doc(db, 'notes', String(id));

        // Extra safety: Remove restricted keys if present
        // eslint-disable-next-line no-unused-vars
        const { ownerId, sharedWith, ownerEmail, ...safeUpdates } = updates;

        // Remove undefined keys (Firestore rejection fix)
        Object.keys(safeUpdates).forEach(key => safeUpdates[key] === undefined && delete safeUpdates[key]);

        await updateDoc(ref, safeUpdates);
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
        await setDoc(ref, { ...caregiver, id });
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
    }
};
