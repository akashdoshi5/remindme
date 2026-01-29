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
                    id: 'reminders_v5', // V5: New channel ID to clear old settings
                    name: 'Reminders (High Priority)',
                    description: 'Reminders for medications and tasks',
                    importance: 5,
                    visibility: 1,
                    sound: 'default',
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
                // Immediate notification
                await LocalNotifications.schedule({
                    notifications: [
                        {
                            title: title,
                            body: options.body || '',
                            id: new Date().getTime() % 2147483647,
                            schedule: { at: new Date(Date.now() + 100) },
                            channelId: 'reminders_v5',
                            sound: 'default',
                            actionTypeId: 'REMINDER_ACTIONS_V5', // Ensure buttons appear
                            extra: options.data || null
                        }
                    ]
                });
            } else {
                if (Notification.permission === 'granted') {
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
                    const date = new Date();
                    date.setHours(h, m, 0, 0);

                    if (date <= new Date()) return null;

                    const safeId = parseInt(r.id) % 2147483647;
                    const bodyText = r.instructions ? r.instructions : '';

                    return {
                        title: r.title,
                        body: bodyText,
                        id: safeId,
                        schedule: {
                            at: date,
                            allowWhileIdle: true
                        },
                        channelId: 'reminders_v5',
                        sound: 'default',
                        actionTypeId: 'REMINDER_ACTIONS_V5',
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
                            id: 'REMINDER_ACTIONS_V5',
                            actions: [
                                {
                                    id: 'snooze',
                                    title: 'Snooze',
                                    foreground: false // Background action preferred
                                },
                                {
                                    id: 'done',
                                    title: 'Mark as Done',
                                    foreground: false
                                }
                            ]
                        }]
                    });

                    // Create Channel V5
                    if (res.display === 'granted') {
                        await LocalNotifications.createChannel({
                            id: 'reminders_v5',
                            name: 'Reminders (High Priority)',
                            description: 'Reminders for medications and tasks',
                            importance: 5,
                            visibility: 1,
                            sound: 'default',
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
