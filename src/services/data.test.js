import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataService } from '../services/data';

// Mock Firestore Service to prevent checking auth/network
vi.mock('../services/firestoreService', () => ({
    firestoreService: {
        addReminder: vi.fn(),
        updateReminder: vi.fn(),
        deleteReminder: vi.fn()
    }
}));

// Mock Firebase Auth
vi.mock('../services/firebase', () => ({
    auth: { currentUser: null }, // Start as guest
    db: {},
    storage: {}
}));

describe('dataService Logic', () => {
    beforeEach(() => {
        // Clear local storage and reset store
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('Calculates Recurring Intervals Correctly (Same Day)', () => {
        // Mock State
        const today = new Date().toISOString().split('T')[0];
        const store = {
            settings: { sleepStart: '22:00', sleepEnd: '06:00' },
            reminders: [{
                id: '1',
                title: 'Pill',
                frequency: 'Every 4 Hours',
                time: '08:00', // Start Time
                date: today,
                schedule: {
                    type: 'recurring',
                    startDate: today,
                    frequency: ['morning', 'afternoon', 'evening'], // Dummy for now
                    times: { morning: '08:00' } // This structure varies, let's test the LEGACY interval logic first
                }
            }]
        };

        // We need to inject this into the service or use the public API
        // Since store is private, we rely on public methods.
        // Let's use `getRemindersForDate` with a mocked store if possible, 
        // OR add the reminder via `addReminder`.

        // Let's mock the internal store via local storage override + reload?
        // No, easier to just add the reminder.
        const reminder = {
            id: 'test-1',
            title: 'Test Interval',
            frequency: 'Every 2 Hours',
            time: '08:00',
            date: today,
            schedule: { startDate: today }
        };

        // We are guest, so it saves to local store
        dataService.addReminder(reminder);

        const generated = dataService.getRemindersForDate(today);

        // Should generate: 08:00, 10:00, 12:00... until 22:00
        // 08, 10, 12, 14, 16, 18, 20. (22:00 is Sleep Limit)
        // Check finding 10:00
        const has10 = generated.find(r => r.displayTime === '10:00');
        expect(has10).toBeTruthy();
        expect(has10.isVirtual).toBe(true);
    });

    it('Smart Interval: Resets to Wake Up Time on Next Day', () => {
        const today = "2024-01-01";
        const tomorrow = "2024-01-02";

        // Mock Settings
        // We can't easily mock private `store` but `addReminder` reads from it.
        // We need to ensure settings are set.
        dataService.updateSettings({ sleepStart: '22:00', sleepEnd: '07:00' });

        const reminder = {
            id: 'test-smart',
            title: 'Smart Interval',
            frequency: 'Every 4 Hours',
            time: '12:00', // User started Late on Day 1
            date: today,
            schedule: { startDate: today }
        };

        // Add to store
        // We need to mock 'store' state. 
        // dataService is a singleton with state.

        // Actually, we need to inspect the Logic...
        // Let's rely on the fact that `dataService` uses an internal variable initialized from localStorage.
        // So `dataService.addReminder` pushes to it.

        // Note: `addReminder` is async because of Firestore checks?
        // In guest mode, it is sync-ish but returns promise.

        // Manually inject into store via a helper if needed or just trust add.
        // But `addReminder` logic check `auth.currentUser`. We mocked it to null.

        const added = dataService.addReminder(reminder);

        // Check Day 1 (Today) - Should start at 12:00
        const day1 = dataService.getRemindersForDate(today);
        const day1Times = day1.map(r => r.displayTime);
        expect(day1Times).toContain('12:00');
        expect(day1Times).not.toContain('07:00'); // Shouldn't have morning time

        // Check Day 2 (Tomorrow) - Should start at 07:00 (Wake Up)
        const day2 = dataService.getRemindersForDate(tomorrow);
        const day2Times = day2.map(r => r.displayTime);
        expect(day2Times).toContain('07:00'); // The Smart Fix!
        expect(day2Times).toContain('11:00');
    });
});
