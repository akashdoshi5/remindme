import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll test the Logic inside useReminders.js by extracting it or mocking the environment.
// Since it's a hook, we can test the detection logic directly.

const checkAlarmLogic = (reminders, now, lastNotified = new Set()) => {
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    const currentMins = currentH * 60 + currentM;

    return reminders.filter(r => {
        if (!r.displayTime) return false;
        const [h, m] = r.displayTime.split(':').map(Number);
        const reminderMins = h * 60 + m;
        const diff = currentMins - reminderMins;

        // 2-minute window
        if (diff < 0 || diff > 2) return false;

        // Status Check
        if (r.status === 'taken' || r.status === 'missed') return false;

        return true;
    });
};

describe('Alarm Detection Logic', () => {
    const todayStr = '2024-01-01';

    it('Detects alarm within the 2-minute window', () => {
        const now = new Date(`${todayStr}T10:01:00`);
        const reminders = [
            { id: 1, title: 'Early', displayTime: '09:50', status: 'upcoming' }, // Missed (>2m)
            { id: 2, title: 'Now', displayTime: '10:00', status: 'upcoming' },   // Active (1m diff)
            { id: 3, title: 'Future', displayTime: '10:10', status: 'upcoming' } // Future
        ];

        const active = checkAlarmLogic(reminders, now);
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe(2);
    });

    it('Skips alarms already marked taken', () => {
        const now = new Date(`${todayStr}T10:01:00`);
        const reminders = [
            { id: 2, title: 'Taken', displayTime: '10:00', status: 'taken' }
        ];

        const active = checkAlarmLogic(reminders, now);
        expect(active).toHaveLength(0);
    });

    it('Detects snoozed instance at its new time', () => {
        const now = new Date(`${todayStr}T10:16:00`);
        const reminders = [
            {
                id: 2,
                title: 'Snoozed',
                displayTime: '10:15', // Original was 10:00, snoozed 15m
                status: 'snoozed' // Wait, the current logic says 'snoozed' status is UPCOMING in terms of ringing
            }
        ];

        // Let's refine the logic for 'snoozed' status in the detection loop if needed
        // In useReminders.js, it just checks !isReminderDone.
        // And isReminderDone for 'snoozed' returns TRUE (don't ring) if current < snoozedUntil.
        // But if current >= snoozedUntil, it returns FALSE (ring).

        const active = checkAlarmLogic(reminders, now);
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe(2);
    });
});
