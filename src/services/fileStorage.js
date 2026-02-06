import { openDB } from 'idb';
import { storage, auth } from './firebase'; // Import storage and auth
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

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
    /**
     * V7 Optimization: Client-Side Compression
     */
    compressImage: async (file, maxWidth = 1920, quality = 0.7) => {
        if (!file.type.startsWith('image/') || file.type === 'image/gif') return file; // Skip non-images or GIFs
        if (file.size < 1024 * 1024) return file; // Skip small images (<1MB)

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        console.log(`Compressed: ${(file.size / 1024).toFixed(0)}KB -> ${(blob.size / 1024).toFixed(0)}KB`);
                        resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                    }, 'image/jpeg', quality);
                };
            };
            reader.onerror = (e) => resolve(file); // Fail safe
        });
    },

    saveFile: async (fileBlob, onProgress) => {
        // V7: Compress before uploading
        const fileToUpload = await fileStorage.compressImage(fileBlob);

        const user = auth.currentUser;

        // V12: Safe ID gen for older Android WebViews
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Cloud Storage (Firebase)
        if (user) {
            console.log(`Starting cloud upload to bucket: gs://remindme-app-9988.firebasestorage.app`);
            console.log(`Path: users/${user.uid}/files/${id}`);

            // Explicitly use the GS URL to avoid internal truncation bugs
            const storageRef = ref(storage, `gs://remindme-app-9988.firebasestorage.app/users/${user.uid}/files/${id}`);

            try {
                // V11: Use uploadBytesResumable for Progress Events
                return new Promise((resolve, reject) => {
                    const uploadTask = uploadBytesResumable(storageRef, fileBlob);

                    uploadTask.on('state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            if (onProgress) onProgress(Math.round(progress));
                        },
                        (error) => {
                            // Handle Error
                            console.group("CRITICAL STORAGE UPLOAD ERROR");
                            console.error("Code:", error.code);
                            console.error("Message:", error.message);
                            console.error("Full Error Object:", error);
                            console.groupEnd();
                            reject(error);
                        },
                        async () => {
                            // Handle Success
                            try {
                                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                                resolve({
                                    id: id,
                                    url: downloadURL,
                                    path: uploadTask.snapshot.ref.fullPath,
                                    type: 'cloud',
                                    name: fileBlob.name,
                                    mimeType: fileBlob.type
                                });
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });
            } catch (error) {
                // Should be caught by downloadURL failure or init failure, but safety net
                console.error("Upload init error", error);
                throw error;
            }
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

    // RECOVERY
    getAllLocalFiles: async () => {
        const db = await dbPromise;
        return await db.getAll(STORE_NAME);
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
