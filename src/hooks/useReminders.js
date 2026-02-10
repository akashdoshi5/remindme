import { useState, useEffect, useCallback, useRef } from 'react';
import { dataService, getTodayString } from '../services/data';
import { Capacitor } from '@capacitor/core';
import { useNotifications } from './useNotifications';

export const useReminders = (setActiveAlarm) => {
    const { scheduleReminders, sendNotification } = useNotifications();
    const [reminders, setReminders] = useState([]);
    const notifiedRef = useRef(new Set()); // Track notified instances to prevent spam

    // 1. Initial Load & Sync
    const loadReminders = useCallback(async () => {
        try {
            const todayStr = getTodayString();
            // FIX: Schedule next 7 days of reminders to ensure background reliability
            const allFuture = dataService.getUpcomingReminders(7);
            setReminders(allFuture);
            scheduleReminders(allFuture);
        } catch (error) {
            console.error("Failed to load reminders:", error);
        }
    }, [scheduleReminders]);

    useEffect(() => {
        loadReminders();

        // Listen for storage updates (from sync or local edits)
        window.addEventListener('storage-update', loadReminders);
        return () => window.removeEventListener('storage-update', loadReminders);
    }, [loadReminders]);

    // 2. Foreground Check Loop (Every 15s)
    useEffect(() => {
        const checkAlarms = () => {
            const now = new Date();
            const currentH = now.getHours();
            const currentM = now.getMinutes();

            // Get fresh data for TODAY in case of midline changes
            const todayStr = new Date().toLocaleDateString('en-CA');
            const currentReminders = dataService.getRemindersForDate(todayStr);

            // Find any reminder that matches NOW (or just passed in last 2 mins due to throttling)
            const active = currentReminders.find(r => {
                if (!r.displayTime) return false;
                const [h, m] = r.displayTime.split(':').map(Number);

                const reminderMins = h * 60 + m;
                const activeMins = currentH * 60 + currentM;

                const diff = activeMins - reminderMins;

                // Match if exact minute OR within last 2 minutes (if missed due to sleep/throttle)
                // AND not crossing midnight constraint simply yet (handled by day refresh)
                if (diff < 0 || diff > 2) return false;

                // IMPORTANT: Check if already completed/snoozed for this instance
                const instanceKey = r.instanceKey || `${r.id}_${todayStr}`;

                // Check status
                // If it was snoozed, getRemindersForDate would have returned the NEW time. 
                // So we are checking against the SNOOZED time here.

                return true;
            });

            if (active) {
                const todayStr = new Date().toISOString().split('T')[0];
                const instanceKey = active.instanceKey || `${active.id}_${todayStr}`;

                // Check if already done today
                const isDone = dataService.isReminderDone(active.id, instanceKey);

                if (!isDone) {
                    // Trigger Modal
                    setActiveAlarm(prev => (prev?.id === active.id ? prev : { ...active, instanceKey }));

                    // Trigger Web Notification (Debounced)
                    if (!Capacitor.isNativePlatform()) {
                        if (!notifiedRef.current.has(instanceKey)) {
                            notifiedRef.current.add(instanceKey);
                            sendNotification(active.title, {
                                body: active.instructions || 'Reminder',
                                data: { uniqueId: active.uniqueId }
                            });
                        }
                    }
                }
            } else {
                // Fix for "Stuck" Alarm:
                // If the currently showing alarm is no longer "active" (e.g. Snoozed remotely, time passed), close it.
                // We perform a safe check to ensure we don't close it instantly if it just missed the 2-min window but user is interacting?
                // Actually, if it missed the window, it's missed. It should close.
                // If it was Snoozed (time changed), it definitely should close.
                setActiveAlarm(prev => {
                    if (prev) { }
                    return null;
                });
            }
        };

        const interval = setInterval(checkAlarms, 2000); // Check every 2s for responsiveness
        checkAlarms(); // Initial check

        // Listen for global data updates (e.g. Snooze from Notification) to re-evaluate alarms immediately
        window.addEventListener('data-updated', checkAlarms);

        return () => {
            clearInterval(interval);
            window.removeEventListener('data-updated', checkAlarms);
        };
    }, [setActiveAlarm, sendNotification]);

    // 3. Listen for Snooze/Done actions to CLEAR notified ref
    // This ensures that if a reminder is snoozed, we can notify again when the snooze time arrives.
    useEffect(() => {
        const handleClearRef = (event) => {
            const { instanceKey } = event.detail;
            if (instanceKey && notifiedRef.current.has(instanceKey)) {
                notifiedRef.current.delete(instanceKey);
            }
        };

        window.addEventListener('clear-notification-ref', handleClearRef);
        return () => window.removeEventListener('clear-notification-ref', handleClearRef);
    }, []);

    return { reminders };
};
