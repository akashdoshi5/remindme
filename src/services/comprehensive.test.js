import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dataService } from './data';

// Mock Dependencies
vi.mock('./firebase', () => ({
    auth: { currentUser: { uid: 'test-user', email: 'test@example.com' } }
}));

vi.mock('./firestoreService', () => ({
    firestoreService: {
        getRemindersRealtime: vi.fn(),
        getNotesRealtime: vi.fn(),
        getSharedNotesRealtime: vi.fn(),
        getSettingsRealtime: vi.fn(),
        updateNote: vi.fn(),
    }
}));

describe('RemindMeBuddy Comprehensive Logic', () => {

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Reminder Scheduling (expandRemindersForDate)', () => {
        const baseReminder = {
            id: 'r1',
            title: 'Vitamin C',
            schedule: {
                frequency: ['morning'],
                times: { morning: '08:00' },
                startDate: '2026-02-01',
                type: 'recurring'
            }
        };

        it('should generate instance for valid date', () => {
            // Set time to 07:00 (Before 08:00) so it is upcoming
            vi.setSystemTime(new Date('2026-02-05T07:00:00'));

            const date = '2026-02-05';
            const expanded = dataService.expandRemindersForDate(date, [baseReminder]);

            expect(expanded).toHaveLength(1);
            expect(expanded[0].time).toBe('08:00');
            expect(expanded[0].status).toBe('upcoming');
        });

        it('should respect durationDays', () => {
            const shortTerm = {
                ...baseReminder,
                schedule: { ...baseReminder.schedule, durationDays: 3 } // Feb 1, 2, 3
            };

            const validDate = '2026-02-03';
            const invalidDate = '2026-02-04'; // Day 4

            const res1 = dataService.expandRemindersForDate(validDate, [shortTerm]);
            expect(res1).toHaveLength(1);

            const res2 = dataService.expandRemindersForDate(invalidDate, [shortTerm]);
            expect(res2).toHaveLength(0);
        });

        it('should handle "Every X Hours" intervals', () => {
            const intervalReminder = {
                id: 'r2',
                title: 'Water',
                frequency: 'Every 2 Hours',
                startTime: '08:00',
                endTime: '12:00',
                date: '2026-02-09'
            };

            // Expected: 08:00, 10:00, 12:00
            const expanded = dataService.expandRemindersForDate('2026-02-09', [intervalReminder]);

            expect(expanded.length).toBeGreaterThanOrEqual(3);
            const times = expanded.map(e => e.time);
            expect(times).toContain('08:00');
            expect(times).toContain('10:00');
            expect(times).toContain('12:00');
        });
    });

    describe('Report Status Logic', () => {
        // Redefine per test or use helper to avoid mutation issues
        const getBaseReminder = () => ({
            id: 'r1',
            title: 'Meds',
            schedule: {
                frequency: ['morning'],
                times: { morning: '09:00' }, // 9 AM
                startDate: '2026-02-01',
                type: 'recurring'
            },
            logs: {}
        });

        it('should detect "Taken" status from logs', () => {
            const reminder = getBaseReminder();
            const date = '2026-02-10';
            const instanceKey = `${date}_period_morning`;

            // Set time to 10:00
            vi.setSystemTime(new Date('2026-02-10T10:00:00'));

            reminder.logs[instanceKey] = {
                status: 'taken',
                takenAt: '2026-02-10T09:05:00.000Z',
                updatedAt: '2026-02-10T09:05:00.000Z'
            };

            const expanded = dataService.expandRemindersForDate(date, [reminder]);
            expect(expanded[0].status).toBe('taken');
            expect(expanded[0].takenAt).toBeDefined();
        });

        it('should detect "Missed" if time passed by > 2 hours', () => {
            const reminder = getBaseReminder();
            const date = '2026-02-10';
            // Set current time to 13:00 (4 hours after 09:00)
            vi.setSystemTime(new Date('2026-02-10T13:00:00'));

            // No logs
            reminder.logs = {};

            const expanded = dataService.expandRemindersForDate(date, [reminder]);
            expect(expanded[0].status).toBe('missed');
        });

        /*
        it('should detect "Fuzzy Match" for schedule drift', () => {
            const reminder = getBaseReminder();
            // Scenario: Reminder scheduled at 09:00
            // Log exists for 08:30 (e.g. timezone shift)
            const date = '2026-02-10';
            const fuzzyKey = `${date}_time_08:30`;
            
            // Set time to 10:00 (within range so not missed if it didn't match)
            vi.setSystemTime(new Date('2026-02-10T10:00:00'));

            reminder.logs = {
                [fuzzyKey]: { 
                    status: 'taken', 
                    takenAt: '2026-02-10T08:30:00.000Z' 
                }
            };

            const expanded = dataService.expandRemindersForDate(date, [reminder]);
            
            // Should pick up the log via fuzzy match
            expect(expanded[0].status).toBe('taken');
        });
        */
    });
});
