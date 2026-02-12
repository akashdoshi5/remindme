import { describe, it, expect } from 'vitest';

// ----------------------------------------------------------------------
// COPY OF MERGE LOGIC FROM data.js (syncFromCloud - notes section)
// ----------------------------------------------------------------------
// We test a pure function version of the logic here to ensure correctness
// without mocking the entire Firestore/LocalStorage environment.
// ----------------------------------------------------------------------

function mergeNotes(localNotes, cloudNotes, deletedNoteIds = new Set()) {
    // Filter out locally deleted notes first
    const validCloudNotes = cloudNotes.filter(n => !deletedNoteIds.has(String(n.id)));
    const mergedMap = new Map();

    validCloudNotes.forEach(cloudNote => {
        const localNote = localNotes.find(n => String(n.id) === String(cloudNote.id));

        if (localNote) {
            const localTime = localNote.updatedAt ? new Date(localNote.updatedAt).getTime() : 0;
            const cloudTime = cloudNote.updatedAt ? new Date(cloudNote.updatedAt).getTime() : 0;

            // 1. PINNED STATUS: Local UI state wins if set, else Cloud
            const mergedPinned = localNote.isPinned ?? cloudNote.isPinned;

            // 2. CONTENT MERGE
            let mergedContent = cloudNote.content;
            let mergedItems = cloudNote.items;
            let mergedFiles = cloudNote.files;
            let mergedAudio = cloudNote.audioData;
            let mergedType = cloudNote.type;
            let mergedUpdatedAt = cloudNote.updatedAt;

            const isContentDifferent = localNote.content !== cloudNote.content;

            if (localTime >= cloudTime) {
                // Local is newer
                mergedContent = localNote.content;
                mergedItems = localNote.items;
                mergedFiles = localNote.files;
                mergedAudio = localNote.audioData;
                mergedType = localNote.type;
                mergedUpdatedAt = localNote.updatedAt;

                // DATA RECOVERY: If Cloud has content not in Local, append it
                if (cloudNote.content && localNote.content && isContentDifferent && !localNote.content.includes(cloudNote.content)) {
                    mergedContent = `${localNote.content}\n\n--- [Synced Version] ---\n${cloudNote.content}`;
                }

                // Merge Lists (Union)
                if (localNote.type === 'shopping' && cloudNote.type === 'shopping' && cloudNote.items) {
                    const itemMap = new Map();
                    (localNote.items || []).forEach(i => itemMap.set(i.text.trim().toLowerCase(), i));
                    (cloudNote.items || []).forEach(i => {
                        const key = i.text.trim().toLowerCase();
                        if (!itemMap.has(key)) {
                            itemMap.set(key, i);
                        }
                    });
                    mergedItems = Array.from(itemMap.values());
                }

                // Merge Files (Union)
                if (cloudNote.files && cloudNote.files.length > 0) {
                    const existingUrls = new Set((localNote.files || []).map(f => f.url || f.data));
                    const newFiles = [...(localNote.files || [])];
                    cloudNote.files.forEach(f => {
                        if (!existingUrls.has(f.url || f.data)) {
                            newFiles.push(f);
                        }
                    });
                    mergedFiles = newFiles;
                }

            } else {
                // Cloud is newer
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
                ...cloudNote,
                content: mergedContent,
                items: mergedItems,
                files: mergedFiles,
                audioData: mergedAudio,
                type: mergedType,
                updatedAt: mergedUpdatedAt,
                isPinned: mergedPinned
            });

        } else {
            mergedMap.set(String(cloudNote.id), cloudNote);
        }
    });

    // Preserve local-only
    localNotes.forEach(localNote => {
        if (!mergedMap.has(String(localNote.id)) && !deletedNoteIds.has(String(localNote.id))) {
            mergedMap.set(String(localNote.id), localNote);
        }
    });

    return Array.from(mergedMap.values());
}

// ----------------------------------------------------------------------
// TESTS
// ----------------------------------------------------------------------

describe('Robust Note Merge Logic', () => {

    it('Should concatenate text when Local is Newer but Cloud is different', () => {
        const local = [{
            id: '1',
            content: 'Local Content',
            updatedAt: '2025-01-02T10:00:00Z',
            type: 'text'
        }];
        const cloud = [{
            id: '1',
            content: 'Cloud Content',
            updatedAt: '2025-01-01T10:00:00Z',
            type: 'text'
        }];

        const result = mergeNotes(local, cloud);
        expect(result[0].content).toContain('Local Content');
        expect(result[0].content).toContain('[Synced Version]');
        expect(result[0].content).toContain('Cloud Content');
        expect(result[0].updatedAt).toBe('2025-01-02T10:00:00Z'); // Local Time Wins
    });

    it('Should concatenate text when Cloud is Newer but Local is different', () => {
        const local = [{
            id: '1',
            content: 'Old Local Content',
            updatedAt: '2025-01-01T10:00:00Z',
            type: 'text'
        }];
        const cloud = [{
            id: '1',
            content: 'New Cloud Content',
            updatedAt: '2025-01-02T10:00:00Z',
            type: 'text'
        }];

        const result = mergeNotes(local, cloud);
        expect(result[0].content).toContain('New Cloud Content');
        expect(result[0].content).toContain('[Local Unsynced]');
        expect(result[0].content).toContain('Old Local Content');
        expect(result[0].updatedAt).toBe('2025-01-02T10:00:00Z'); // Cloud Time Wins
    });

    it('Should NOT concatenate if one contains the other (redundancy check)', () => {
        const local = [{
            id: '1',
            content: 'Hello World',
            updatedAt: '2025-01-02T10:00:00Z'
        }];
        const cloud = [{
            id: '1',
            content: 'Hello',
            updatedAt: '2025-01-01T10:00:00Z'
        }];

        const result = mergeNotes(local, cloud);
        expect(result[0].content).toBe('Hello World'); // Just keeps local, no concat
    });

    it('Should Union Checklists', () => {
        const local = [{
            id: 'Check',
            type: 'shopping',
            items: [{ text: 'Milk', done: true }, { text: 'Bread', done: false }],
            updatedAt: '2025-01-02T10:00:00Z'
        }];
        const cloud = [{
            id: 'Check',
            type: 'shopping',
            items: [{ text: 'Milk', done: false }, { text: 'Eggs', done: true }],
            updatedAt: '2025-01-01T10:00:00Z'
        }];

        const result = mergeNotes(local, cloud);
        const items = result[0].items;

        expect(items).toHaveLength(3); // Milk, Bread, Eggs
        expect(items.find(i => i.text === 'Bread')).toBeTruthy();
        expect(items.find(i => i.text === 'Eggs')).toBeTruthy();

        // Milk conflict? Local was Newer (Done=True), so it kept Local's Milk (Done=True)
        // logic: uses itemMap.set from local first, then adds missing from cloud.
        // Wait, map key is text.
        // map.set('milk', {text:'Milk', done: true}) [Local]
        // cloud loop: 'milk' exists? Yes. Do nothing.
        // So Local status wins.
        expect(items.find(i => i.text === 'Milk').done).toBe(true);
    });

    it('Should Union Files', () => {
        const local = [{
            id: 'Files',
            files: [{ url: 'http://a.com/1.jpg' }, { url: 'http://a.com/2.jpg' }],
            updatedAt: '2025-01-02T10:00:00Z'
        }];
        const cloud = [{
            id: 'Files',
            files: [{ url: 'http://a.com/1.jpg' }, { url: 'http://a.com/3.jpg' }],
            updatedAt: '2025-01-01T10:00:00Z'
        }];

        const result = mergeNotes(local, cloud);
        expect(result[0].files).toHaveLength(3); // 1, 2, 3
    });

    it('Should preserve Local Only notes unless deleted', () => {
        const local = [
            { id: 'new-local', content: 'New' },
            { id: 'deleted-local', content: 'Del' }
        ];
        const cloud = [];
        const deletedIds = new Set(['deleted-local']);

        const result = mergeNotes(local, cloud, deletedIds);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('new-local');
    });
});
