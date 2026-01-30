import { useState, useEffect, useCallback, useRef } from 'react';
import { dataService } from '../services/data';
import { useNotifications } from './useNotifications';

export const useReminders = (setActiveAlarm) => {
    const { scheduleReminders, sendNotification } = useNotifications();
    const [reminders, setReminders] = useState([]);
    const notifiedRef = useRef(new Set()); // Track notified instances to prevent spam

    // 1. Initial Load & Sync
    useEffect(() => {
        const loadReminders = () => {
            const todayStr = new Date().toLocaleDateString('en-CA');
            // FIX: Schedule next 7 days of reminders to ensure background reliability
            const allFuture = dataService.getUpcomingReminders(7);
            // const all = dataService.getRemindersForDate(todayStr); 
            setReminders(allFuture);
            scheduleReminders(allFuture);
        };

        loadReminders();

        // Listen for storage updates (from sync or local edits)
        window.addEventListener('storage-update', loadReminders);
        return () => window.removeEventListener('storage-update', loadReminders);
    }, [scheduleReminders]);

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
                    // We check if we already notified for this instanceKey
                    if (!notifiedRef.current.has(instanceKey)) {
                        notifiedRef.current.add(instanceKey);

                        // Clean up old keys periodically? For now, Set grows slowly per day.
                        sendNotification(active.title, {
                            body: active.instructions || 'Reminder',
                            data: { uniqueId: active.uniqueId } // Tag for actions
                        });
                    }
                }
            }
        };

        const interval = setInterval(checkAlarms, 15000); // Check every 15s
        checkAlarms(); // Initial check

        return () => clearInterval(interval);
    }, [setActiveAlarm, sendNotification]);

    return { reminders };
};
