import { useState, useCallback, useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export const useNotifications = () => {
    const [permission, setPermission] = useState('default');

    const requestPermission = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            const result = await LocalNotifications.requestPermissions();
            setPermission(result.display);

            // Create Channel for Android
            if (result.display === 'granted') {
                await LocalNotifications.createChannel({
                    id: 'reminders',
                    name: 'Reminders',
                    description: 'Reminders for medications and tasks',
                    importance: 5, // High importance
                    visibility: 1, // Public
                    sound: 'default',
                    vibration: true,
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
                // Immediate notification (for testing or immediate alerts)
                await LocalNotifications.schedule({
                    notifications: [
                        {
                            title: title,
                            body: options.body || '',
                            id: new Date().getTime(),
                            schedule: { at: new Date(Date.now() + 100) },
                            channelId: 'reminders',
                            sound: 'default',
                            actionTypeId: "",
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

    // Clear delivered notifications (e.g. when snoozed/done via App)
    const clearDelivered = useCallback(async (id) => {
        if (!Capacitor.isNativePlatform()) return;
        try {
            if (id) {
                // Remove specific
                await LocalNotifications.removeDeliveredNotifications({
                    notifications: [{ id: id }]
                });
            } else {
                // Remove all (fallback)
                await LocalNotifications.removeAllDeliveredNotifications();
            }
        } catch (error) {
            console.error("Error clearing notifications:", error);
        }
    }, []);

    // New: Schedule Batch Reminders
    const scheduleReminders = useCallback(async (reminders) => {
        if (!Capacitor.isNativePlatform()) return;

        try {
            // Cancel all pending first to avoid duplicates (naive approach)
            const pending = await LocalNotifications.getPending();
            if (pending.notifications.length > 0) {
                await LocalNotifications.cancel(pending);
            }

            const notificationsToSchedule = reminders.map(r => {
                if (!r.displayTime) return null;
                const [h, m] = r.displayTime.split(':').map(Number);
                const date = new Date();
                date.setHours(h, m, 0, 0);

                if (date <= new Date()) {
                    return null;
                }

                return {
                    title: `Reminder: ${r.title}`,
                    body: r.instructions || `It's time for ${r.type}`,
                    id: parseInt(r.id), // Ensure ID matches what we used for storage
                    schedule: {
                        at: date,
                        allowWhileIdle: true // Critical for Doze mode
                    },
                    channelId: 'reminders',
                    sound: 'default', // Explicitly request sound
                    extra: { uniqueId: r.uniqueId }
                };
            }).filter(n => n !== null && !isNaN(n.id));

            if (notificationsToSchedule.length > 0) {
                await LocalNotifications.schedule({ notifications: notificationsToSchedule });
                console.log(`Scheduled ${notificationsToSchedule.length} notifications`);
            }

        } catch (error) {
            console.error("Scheduling Error:", error);
        }
    }, []);

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            LocalNotifications.checkPermissions().then(async (res) => {
                setPermission(res.display);
                if (res.display === 'granted') {
                    // Start listener
                    LocalNotifications.addListener('localNotificationActionPerformed', (payload) => {
                        console.log('Notification action:', payload);
                        window.dispatchEvent(new CustomEvent('notification-action', { detail: { action: payload.actionId, tag: payload.notification.extra?.uniqueId } }));
                    });
                    // Create Channel (ensure it exists)
                    await LocalNotifications.createChannel({
                        id: 'reminders',
                        name: 'Reminders',
                        description: 'Reminders for medications and tasks',
                        importance: 5,
                        visibility: 1,
                        sound: 'default',
                        vibration: true,
                    });
                }
            });
        } else {
            setPermission(Notification.permission);
        }
    }, []);

    return {
        permission,
        requestPermission,
        sendNotification,
        scheduleReminders,
        clearDelivered
    };
};
