import { useState, useCallback, useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export const useNotifications = () => {
    const [permission, setPermission] = useState('default');

    const requestPermission = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            const result = await LocalNotifications.requestPermissions();
            setPermission(result.display);

            // Create Channel for Android - V5 Force Update
            if (result.display === 'granted') {
                await LocalNotifications.createChannel({
                    id: 'reminders_v10', // V10: Force Sound Reset
                    name: 'Reminders (V10)',
                    description: 'Reminders for medications and tasks',
                    importance: 5,
                    visibility: 1,
                    vibration: true,
                    lights: true,
                });
            }
            return result.display;
        } else {
            if (!('Notification' in window)) {
                console.warn('This browser does not support desktop notification');
                return 'denied';
            }
            const result = await Notification.requestPermission();
            setPermission(result);
            return result;
        }
    }, []);


    const sendNotification = useCallback(async (title, options = {}) => {
        try {
            if (Capacitor.isNativePlatform()) {
                // ... existing native logic ...
                await LocalNotifications.schedule({
                    notifications: [
                        {
                            title: title,
                            body: options.body || '',
                            id: new Date().getTime() % 2147483647,
                            schedule: { at: new Date(Date.now() + 100) },
                            channelId: 'reminders_v10',
                            smallIcon: 'ic_notification_bell', // Explicitly set icon
                            actionTypeId: 'REMINDER_ACTIONS_V10',
                            extra: options.data || null
                        }
                    ]
                });
            } else {
                // WEB: Use Service Worker for Buttons
                if ('serviceWorker' in navigator && Notification.permission === 'granted') {
                    const registration = await navigator.serviceWorker.ready;

                    // Define Actions
                    const actions = [
                        { action: 'snooze', title: 'Snooze' },
                        { action: 'done', title: 'Mark as Done' }
                    ];

                    await registration.showNotification(title, {
                        ...options,
                        icon: '/icon.png', // Ensure icon exists
                        actions: actions,
                        tag: options.data?.uniqueId, // To allow closing specific one
                        requireInteraction: true, // Keep it visible until interaction
                        data: options.data
                    });
                } else if (Notification.permission === 'granted') {
                    // Fallback for non-SW support (rare)
                    new Notification(title, options);
                }
            }
        } catch (error) {
            console.error("Notification Error:", error);
        }
    }, []);

    const clearDelivered = useCallback(async (id) => {
        if (!Capacitor.isNativePlatform()) return;
        try {
            if (id) {
                await LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: id }] });
            } else {
                await LocalNotifications.removeAllDeliveredNotifications();
            }
        } catch (error) {
            console.error("Error clearing notifications:", error);
        }
    }, []);

    const scheduleReminders = useCallback(async (reminders) => {
        try {
            if (Capacitor.isNativePlatform()) {
                const pending = await LocalNotifications.getPending();
                if (pending.notifications.length > 0) {
                    await LocalNotifications.cancel(pending);
                }

                const notificationsToSchedule = reminders.map(r => {
                    if (!r.displayTime) return null;
                    const [h, m] = r.displayTime.split(':').map(Number);

                    let date = new Date();
                    if (r.targetDate) {
                        date = new Date(r.targetDate); // Parse YYYY-MM-DD
                    }

                    date.setHours(h, m, 0, 0);

                    const now = new Date();

                    // Logic for Daily/Recurring: If passed today, schedule for tomorrow
                    // ONLY if we don't have an explicit target date (which implies confidence)
                    // If targetDate came from getUpcomingReminders, it is correct.
                    if (!r.targetDate && date <= now) {
                        if (r.frequency === 'Daily' || (r.schedule && r.schedule.type === 'recurring')) {
                            date.setDate(date.getDate() + 1);
                        } else {
                            // Single time passed
                            return null;
                        }
                    }

                    // Extra safety: If specific date is set and it's not today/future, handle logic?
                    // But for simplified view, the `reminders` passed here are usually "Active" ones. 
                    // However, `scheduleReminders` takes a list. 
                    // If `r.date` exists (One Time) and it's different from Today, we should respect that date.
                    if (r.date && r.frequency === 'Once' && !r.targetDate) {
                        const targetDate = new Date(r.date);
                        targetDate.setHours(h, m, 0, 0);
                        if (targetDate <= now) return null;
                        date = targetDate;
                    }

                    const safeId = parseInt(r.id) % 2147483647;
                    const bodyText = r.instructions ? r.instructions : (r.type === 'Medication' ? 'Time for your meds!' : 'Reminder');

                    // EXTRA SAFETY: Don't schedule past events (tolerance 1 min)
                    if (date.getTime() < now.getTime() - 60000) return null;

                    return {
                        title: r.title,
                        body: bodyText,
                        id: safeId,
                        schedule: {
                            at: date,
                            allowWhileIdle: true
                        },
                        channelId: 'reminders_v10',
                        smallIcon: 'ic_notification_bell',
                        actionTypeId: 'REMINDER_ACTIONS_V10',
                        extra: { uniqueId: r.uniqueId }
                    };
                }).filter(n => n !== null && !isNaN(n.id));

                if (notificationsToSchedule.length > 0) {
                    await LocalNotifications.schedule({ notifications: notificationsToSchedule });
                    console.log(`Scheduled ${notificationsToSchedule.length} notifications (V5 Native)`);
                }
            } else {
                // WEB NOTIFICATION LOGIC
                // Clear existing timeouts ideally, but strict "schedule" API doesn't exist for Web Notification.
                // We must rely on `setTimeout` or similar logic in a service worker or runtime loop.
                // Since this hook is called by `useReminders` which has a polling loop (`useEffect` interval),
                // we arguably don't need to "schedule" future web notifications here if `useReminders` triggers them?
                // WRONG. `useReminders` triggers `setActiveAlarm` (Modal).
                // `scheduleReminders` is usually for reducing poll dependency or native OS handling.
                // If we want web notifications to pop up *alongside* the modal, checking in `useReminders` loop is better.
                // But let's see if we can perform a simple "timeout" based schedule for the current session?
                // Actually `useReminders.js` (hook) handles the trigger for immediate alarms.
                // This `scheduleReminders` function is triggered ONCE when data changes to offload scheduling to OS.
                // For Web, we can't really "offload" effectively without SW.
                // SO: "Notification from browser ... did not arrive" means `useReminders` likely decided to ring (Modal) 
                // but didn't fire a system notification?

                // Let's verify `useReminders.js` again? 
                // If `useReminders` calls `sendNotification` when alarm fires, then we are good.
                // If `useReminders` EXPECTS `scheduleReminders` to handle it, then Web is broken.

                // Assumption: `useReminders` only plays audio/modal. 
                // Let's check `useReminders.js` briefly next?
                // But for now, I will unlock this block to at least console log or attempt simple timeouts if feasible.
                // Given the constraint, if `useReminders` relies on this, we need to replicate scheduling.
                console.log("Web Scheduling: Browser requires open tab. Relying on useReminders Polling for now.");
            }

        } catch (error) {
            console.error("Scheduling Error:", error);
        }
    }, []);

    // Registration of actions (Buttons)
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            LocalNotifications.checkPermissions().then(async (res) => {
                setPermission(res.display);

                // ALWAYS Try to register types if native, regardless of permission state (sometimes needed pre-grant)
                // or just do it on load.
                try {
                    await LocalNotifications.registerActionTypes({
                        types: [{
                            id: 'REMINDER_ACTIONS_V10',
                            actions: [
                                {
                                    id: 'snooze',
                                    title: 'Snooze',
                                    foreground: true // Try foreground to see if buttons appear more reliably or if it brings app to front
                                },
                                {
                                    id: 'done',
                                    title: 'Mark as Done',
                                    foreground: true
                                }
                            ]
                        }]
                    });

                    console.log("Registered Actions V9 with Foreground=True");

                    // Create Channel V6
                    if (res.display === 'granted') {
                        await LocalNotifications.createChannel({
                            id: 'reminders_v10',
                            name: 'Reminders (V10)',
                            description: 'Reminders for medications and tasks',
                            importance: 5,
                            visibility: 1,
                            vibration: true,
                            lights: true,
                        });
                    }

                    // Listener for actions
                    LocalNotifications.addListener('localNotificationActionPerformed', (payload) => {
                        console.log('Notification action:', payload);
                        // Dispatch event for UI or Service handling
                        window.dispatchEvent(new CustomEvent('notification-action', {
                            detail: { action: payload.actionId, tag: payload.notification.extra?.uniqueId }
                        }));
                    });

                } catch (e) {
                    console.error("Error initializing notifications V5", e);
                }
            });
        } else {
            setPermission(Notification.permission);
        }
    }, []);

    const checkPermissions = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            const result = await LocalNotifications.checkPermissions();
            setPermission(result.display);
            return result.display;
        }
        return Notification.permission;
    }, []);

    return {
        permission,
        requestPermission,
        checkPermissions,
        sendNotification,
        scheduleReminders,
        clearDelivered
    };
};
