import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataService } from './data';
import { firestoreService } from './firestoreService';

// Mock firestoreService
vi.mock('./firestoreService', () => ({
    firestoreService: {
        shareNote: vi.fn(),
        unshareNote: vi.fn(),
        addNote: vi.fn(),
        updateNote: vi.fn()
    }
}));

// Mock firebase auth
vi.mock('./firebase', () => ({
    auth: {
        currentUser: { uid: 'test_user', email: 'test@example.com' }
    },
    db: {}
}));

describe('Share Note Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call shareNote with correct arguments', async () => {
        const noteId = 'note_123';
        const email = 'test@example.com';

        // Mock successful share
        firestoreService.shareNote.mockResolvedValue(true);

        const result = await dataService.shareNote(noteId, email);

        expect(firestoreService.shareNote).toHaveBeenCalledWith(noteId, email);
        expect(result).toBe(true);
    });

    it('should call unshareNote with correct arguments', async () => {
        const noteId = 'note_123';
        const email = 'remove@example.com';

        await dataService.unshareNote(noteId, email);

        expect(firestoreService.unshareNote).toHaveBeenCalledWith(noteId, email);
    });

    it('should handle share failure gracefully (throw error)', async () => {
        const noteId = 'note_fail';
        const email = 'fail@example.com';

        firestoreService.shareNote.mockRejectedValue(new Error("Network fail"));

        // Expect the service to bubble up the error
        await expect(dataService.shareNote(noteId, email)).rejects.toThrow("Network fail");
    });
});
