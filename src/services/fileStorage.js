import { openDB } from 'idb';
import { storage, auth } from './firebase'; // Import storage and auth
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

const DB_NAME = 'remindme-files-db';
const STORE_NAME = 'files';

const dbPromise = openDB(DB_NAME, 1, {
    upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    },
});

export const fileStorage = {
    /**
     * Save a file to either Local IDB or Firebase Storage
     * @param {File} fileBlob 
     * @param {Function} onProgress (progress) => void - progress is 0-100
     * @returns {Promise<{id: string, url: string, type: 'local'|'cloud'}>}
     */
    saveFile: async (fileBlob, onProgress) => {
        const user = auth.currentUser;
        const id = crypto.randomUUID();

        // Cloud Storage (Firebase)
        if (user) {
            return new Promise((resolve, reject) => {
                const storageRef = ref(storage, `users/${user.uid}/files/${id}_${fileBlob.name}`);
                const uploadTask = uploadBytesResumable(storageRef, fileBlob);

                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        if (onProgress) onProgress(progress);
                    },
                    (error) => {
                        console.error("Upload failed", error);
                        reject(error);
                    },
                    async () => {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        resolve({
                            id: id,
                            url: downloadURL,
                            path: uploadTask.snapshot.ref.fullPath,
                            type: 'cloud',
                            name: fileBlob.name,
                            mimeType: fileBlob.type
                        });
                    }
                );
            });
        }

        // Local Storage (IndexedDB)
        const db = await dbPromise;
        // Simulate progress for local save (it's usually instant or blocking)
        if (onProgress) onProgress(10);
        await db.put(STORE_NAME, { id, blob: fileBlob, created: Date.now() });
        if (onProgress) onProgress(100);

        return {
            id: id,
            url: null, // No URL for local blobs until retrieved
            type: 'local',
            name: fileBlob.name,
            mimeType: fileBlob.type
        };
    },

    getFile: async (fileRef) => {
        // fileRef can be string ID (legacy/local) or object { id, type, url }

        // Handle legacy string ID (assume local) or URL
        if (typeof fileRef === 'string') {
            // Check IDB first
            const db = await dbPromise;
            const item = await db.get(STORE_NAME, fileRef);
            if (item) return item.blob;

            // If not found locally, maybe it's a URL?
            if (fileRef.startsWith('http')) return null; // Client should open URL directly
            return null;
        }

        if (fileRef.type === 'cloud' && fileRef.url) {
            // It's a cloud file. We return the URL? 
            // The UI usually expects a Blob for "Preview" or "Download".
            // But for cloud files, we should just let the browser handle the URL.
            // However, the caller expects a Blob?
            // checking usage: NotesPage line 305: const blob = await fileStorage.getFile(file.id);
            // We should fetch the blob if requested?
            // Or change NotesPage to handle URL.
            // Fetching blob from URL:
            try {
                const response = await fetch(fileRef.url);
                return await response.blob();
            } catch (e) {
                console.error("Failed to fetch cloud file blob", e);
                return null;
            }
        }

        if (fileRef.type === 'local' || !fileRef.type) {
            const db = await dbPromise;
            const item = await db.get(STORE_NAME, fileRef.id);
            return item ? item.blob : null;
        }

        return null;
    },

    deleteFile: async (fileRef) => {
        const id = typeof fileRef === 'string' ? fileRef : fileRef.id;

        // Try Local
        const db = await dbPromise;
        await db.delete(STORE_NAME, id);

        // Try Cloud if object passed
        if (typeof fileRef === 'object' && fileRef.type === 'cloud' && fileRef.path) {
            const fileRefRef = ref(storage, fileRef.path);
            try {
                await deleteObject(fileRefRef);
            } catch (e) {
                console.warn("Failed to delete cloud file", e);
            }
        }
    }
};
