import { fileStorage } from './fileStorage';
import { storage, auth } from './firebase';
import { ref, listAll, getDownloadURL, getMetadata } from 'firebase/storage';
import { dataService } from './data';

export const recoveryService = {
    recoverOrphanedFiles: async () => {
        const report = {
            recoveredCount: 0,
            errors: []
        };

        try {
            const allNotes = dataService.getNotes();
            const knownFileIds = new Set();

            // Collect all known file IDs from existing notes
            allNotes.forEach(note => {
                if (note.files) {
                    note.files.forEach(f => {
                        if (f.id) knownFileIds.add(f.id);
                        if (f.storageData && f.storageData.id) knownFileIds.add(f.storageData.id);
                    });
                }
            });

            const recoveredFiles = [];

            // 1. Scan Local IndexedDB
            try {
                const localFiles = await fileStorage.getAllLocalFiles();
                console.log(`Scanning ${localFiles.length} local files...`);

                localFiles.forEach(fileRecord => {
                    if (!knownFileIds.has(fileRecord.id)) {
                        // ORPHAN FOUND
                        recoveredFiles.push({
                            id: fileRecord.id,
                            name: fileRecord.blob?.name || `Recovered_Local_${fileRecord.id.substr(0, 8)}`,
                            type: fileRecord.blob?.type || 'application/octet-stream',
                            status: 'ready',
                            file: fileRecord.blob, // Blob itself
                            url: URL.createObjectURL(fileRecord.blob), // Temporary URL
                            storageData: { type: 'local', id: fileRecord.id }
                        });
                    }
                });
            } catch (e) {
                console.error("Local scan failed", e);
                report.errors.push("Local scan failed: " + e.message);
            }

            // 2. Scan Cloud Storage (if authenticated)
            if (auth.currentUser) {
                try {
                    const userFilesRef = ref(storage, `users/${auth.currentUser.uid}/files`);
                    const res = await listAll(userFilesRef);

                    console.log(`Scanning ${res.items.length} cloud files...`);

                    for (const itemRef of res.items) {
                        // ID extraction logic depends on naming convention: "id_name"
                        const fullName = itemRef.name; // e.g. "abc-123_image.png"
                        const id = fullName.split('_')[0];

                        if (!knownFileIds.has(id)) {
                            // ORPHAN FOUND
                            const url = await getDownloadURL(itemRef);
                            let meta = {};
                            try { meta = await getMetadata(itemRef); } catch (e) { }

                            recoveredFiles.push({
                                id: id,
                                name: meta.customMetadata?.originalName || fullName.split('_').slice(1).join('_') || fullName,
                                type: meta.contentType || 'application/octet-stream',
                                status: 'ready',
                                url: url,
                                storageData: {
                                    type: 'cloud',
                                    id: id,
                                    path: itemRef.fullPath,
                                    url: url
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error("Cloud scan failed", e);
                    report.errors.push("Cloud scan failed: " + e.message);
                }
            }

            // 3. Create Note if Orphans Found
            if (recoveredFiles.length > 0) {
                console.log(`Found ${recoveredFiles.length} orphaned files. Creating note.`);
                const newNote = {
                    title: `Recovered Files - ${new Date().toLocaleString()}`,
                    content: `Found ${recoveredFiles.length} files that were missing from your notes.`,
                    files: recoveredFiles,
                    tags: ['recovery', 'auto-generated'],
                    type: 'text'
                };

                await dataService.addNote(newNote);
                report.recoveredCount = recoveredFiles.length;
            }

        } catch (e) {
            console.error("Recovery process failed", e);
            throw e;
        }

        return report;
    }
};
