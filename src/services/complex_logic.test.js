import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataService } from './data';

// Mock Dependencies
vi.mock('./firestoreService', () => ({
    firestoreService: {
        addReminder: vi.fn(),
        updateReminder: vi.fn(),
        deleteReminder: vi.fn(),
        addNote: vi.fn(),
        updateNote: vi.fn()
    }
}));

vi.mock('./firebase', () => ({
    auth: { currentUser: null },
    db: {},
    storage: {}
}));

describe('Complex Scheduling Logic', () => {
    beforeEach(() => {
        localStorage.clear();
        dataService._reset();
        vi.restoreAllMocks();
    });

    it('Medication Schedule: Generates multiple instances (Breakfast, Dinner)', () => {
        const today = '2024-01-01';
        const reminder = {
            id: 'med-1',
            title: 'Multivitamin',
            type: 'Medication',
            schedule: {
                type: 'recurring',
                startDate: today,
                frequency: ['Breakfast', 'Dinner'],
                times: { Breakfast: '08:00', Dinner: '20:00' }
            }
        };

        dataService.addReminder(reminder);
        const generated = dataService.getRemindersForDate(today);

        expect(generated).toHaveLength(2);
        expect(generated[0].displayTime).toBe('08:00');
        expect(generated[1].displayTime).toBe('20:00');
        expect(generated[0].uniqueId).toContain('Breakfast');
    });

    it('Duration Limit: Stops generating instances after durationDays', () => {
        const start = '2024-01-01';
        const day2 = '2024-01-02';
        const day4 = '2024-01-04';

        const reminder = {
            id: 'limited',
            title: 'Antibiotics',
            schedule: {
                type: 'recurring',
                startDate: start,
                durationDays: 3,
                frequency: ['morning'],
                times: { morning: '09:00' }
            }
        };

        dataService.addReminder(reminder);

        // Day 1 & 2 should work
        expect(dataService.getRemindersForDate(start)).toHaveLength(1);
        expect(dataService.getRemindersForDate(day2)).toHaveLength(1);

        // Day 4 should be empty
        expect(dataService.getRemindersForDate(day4)).toHaveLength(0);
    });

    it('Interval Logic: Obeys Sleep Settings', () => {
        const today = '2024-01-01';
        dataService.updateSettings({ sleepStart: '20:00', sleepEnd: '08:00' });

        const reminder = {
            id: 'water',
            title: 'Drink Water',
            frequency: 'Every 4 Hours',
            time: '08:00', // Start
            date: today
        };

        dataService.addReminder(reminder);
        const generated = dataService.getRemindersForDate(today);

        // 08:00, 12:00, 16:00. (20:00 is limit)
        const times = generated.map(r => r.displayTime);
        expect(times).toEqual(['08:00', '12:00', '16:00']);
        expect(times).not.toContain('20:00');
    });

    it('Status Window: 2-hour rule for Missed vs Upcoming', () => {
        const today = new Date().toISOString().split('T')[0];

        // Mock current time to 13:00
        const mockNow = new Date(`${today}T13:00:00`);
        vi.setSystemTime(mockNow);

        const reminder = {
            id: 'status-test',
            title: 'Lunch Pill',
            time: '12:00', // 1 hour ago -> Should be UPCOMING (or overdue but actionable)
            date: today,
            frequency: 'Daily'
        };

        dataService.addReminder(reminder);
        let generated = dataService.getRemindersForDate(today);
        expect(generated[0].status).toBe('upcoming');

        // Move time to 14:01 (2h 1m diff)
        vi.setSystemTime(new Date(`${today}T14:01:00`));
        generated = dataService.getRemindersForDate(today);
        expect(generated[0].status).toBe('missed');

        vi.useRealTimers();
    });

    it('Exceptions: Handles Cancelled instances', () => {
        const today = '2024-01-01';
        const instanceKey = `${today}_morning`;

        const reminder = {
            id: 'ex-test',
            title: 'Pill',
            schedule: {
                type: 'recurring',
                startDate: today,
                frequency: ['morning'],
                times: { morning: '09:00' }
            },
            exceptions: {
                [instanceKey]: { status: 'cancelled' }
            }
        };

        dataService.addReminder(reminder);
        const generated = dataService.getRemindersForDate(today);
        expect(generated).toHaveLength(0);
    });

    describe('Conversion Helpers', () => {
        it('Converts Note to Reminder correctly', () => {
            const note = { title: 'Grocery List', content: 'Buy milk and eggs' };
            const reminder = dataService.convertNoteToReminder(note);

            expect(reminder.title).toBe(note.title);
            expect(reminder.instructions).toBe(note.content);
            expect(reminder.status).toBe('upcoming');
            expect(reminder.date).toBe(new Date().toISOString().split('T')[0]);
        });

        it('Converts Reminder to Note correctly', () => {
            const reminder = {
                title: 'Dr Appointment',
                instructions: 'Bring reports',
                frequency: 'Once',
                type: 'Other'
            };
            const note = dataService.convertReminderToNote(reminder);

            expect(note.title).toBe(reminder.title);
            expect(note.content).toContain('Frequency: Once');
            expect(note.content).toContain('Bring reports');
            expect(note.tags).toContain('Other');
        });
    });
});
