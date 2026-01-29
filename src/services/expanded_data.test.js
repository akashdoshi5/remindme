import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataService } from './data';

// Mock Dependencies
vi.mock('./firestoreService', () => ({
    firestoreService: {
        addReminder: vi.fn(),
        updateReminder: vi.fn(),
        deleteReminder: vi.fn(),
        addNote: vi.fn(n => Promise.resolve({ ...n, id: 'cloud-123' })),
        updateNote: vi.fn(),
        deleteNote: vi.fn(),
        reorderNotes: vi.fn()
    }
}));

vi.mock('./firebase', () => ({
    auth: { currentUser: null },
    db: {},
    storage: {}
}));

describe('Expanded Data Service Logic', () => {
    beforeEach(() => {
        localStorage.clear();
        dataService._reset();
        vi.restoreAllMocks();
    });

    describe('Notes CRUD (Guest Mode)', () => {
        it('Adds a note with a generated ID', async () => {
            const noteData = { title: 'Test Note', content: 'Hello' };
            const added = await dataService.addNote(noteData);

            expect(added.id).toBeDefined();
            expect(added.title).toBe('Test Note');

            const allNotes = dataService.getNotes();
            expect(allNotes).toHaveLength(1);
            expect(allNotes[0].id).toBe(added.id);
        });

        it('Updates an existing note', async () => {
            const added = await dataService.addNote({ title: 'Old Title' });
            await dataService.updateNote(added.id, { title: 'New Title' });

            const allNotes = dataService.getNotes();
            expect(allNotes[0].title).toBe('New Title');
        });

        it('Deletes a note', async () => {
            const added = await dataService.addNote({ title: 'To Delete' });
            await dataService.deleteNote(added.id);

            expect(dataService.getNotes()).toHaveLength(0);
        });
    });

    describe('History & Reporting', () => {
        it('Adds to history when reminder is marked taken', async () => {
            const today = new Date().toISOString().split('T')[0];
            const reminder = {
                id: 'hist-1',
                title: 'Daily Meds',
                type: 'Medication',
                frequency: 'Daily'
            };

            const added = await dataService.addReminder(reminder);
            await dataService.logReminderStatus(added.id, `${today}_08:00`, 'taken');

            const history = dataService.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0].reminderId).toBe(added.id);
            expect(history[0].status).toBe('taken');
            expect(history[0].date).toBe(today);
        });

        it('Handles custom timestamps for historical logging', async () => {
            const customTime = '2024-01-01T10:00:00Z';
            const reminder = { title: 'Old Task' };
            const added = await dataService.addReminder(reminder);
            await dataService.logReminderStatusWithTime(added.id, 'key', 'taken', customTime);

            const history = dataService.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0].timestamp).toBe(customTime);
        });
    });

    describe('Sharing & Security', () => {
        it('Prevents sharing in guest mode', async () => {
            const result = await dataService.shareNote('id', 'test@example.com');
            expect(result).toBe(false);
        });
    });

    describe('Data Syncing', () => {
        it('syncFromCloud merges data correctly into local store', () => {
            const cloudReminders = [{ id: 'cloud-rem', title: 'From Cloud' }];
            dataService.syncFromCloud('reminders', cloudReminders);

            const local = dataService.getReminders();
            expect(local).toHaveLength(1);
            expect(local[0].title).toBe('From Cloud');
        });
    });
});
