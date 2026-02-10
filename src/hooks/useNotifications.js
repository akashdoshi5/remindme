import { useState, useCallback, useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { dataService } from '../services/data';

export const useNotifications = () => {
    const [permission, setPermission] = useState('default');

    // MIGRATION: Ensure channels and actions are created/registered immediately
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {

            // 1. Register Action Types (Buttons) - Do this first!
            LocalNotifications.registerActionTypes({
                types: [{
                    id: 'REMINDER_ACTIONS_V10',
                    actions: [
                        {
                            id: 'snooze',
                            title: 'Snooze',
                            foreground: true
                        },
                        {
                            id: 'done',
                            title: 'Mark as Done',
                            foreground: true
                        }
                    ]
                }]
            }).then(() => console.log('✅ Notification Actions Registered'))
                .catch(e => console.error('❌ Action Registration Failed', e));

            // 2. Create Channels
            LocalNotifications.createChannel({
                id: 'reminders_v10',
                name: 'Reminders',
                description: 'General reminders',
                importance: 4,
                visibility: 1,
                sound: 'chime.wav', // Custom sound
                vibration: true
            }).catch(e => console.error("Channel Create Error", e));

            LocalNotifications.createChannel({
                id: 'reminders_alarm_v1',
                name: 'Alarm Reminders',
                description: 'High priority reminders',
                importance: 5, // Max importance for heads-up
                visibility: 1,
                sound: 'alarm.wav', // Custom sound
                vibration: true
            }).catch(e => console.error("Alarm Channel Create Error", e));

            // 3. Add Action Listener
            LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
                console.log('🔔 Action Performed:', notification.actionId);
                const actionId = notification.actionId;
                const extra = notification.notification.extra;
                const uniqueId = extra?.uniqueId;
                // Note: notification.notification.id is an integer safeId. uniqueId is the string key.

                window.dispatchEvent(new CustomEvent('notification-action', {
                    detail: {
                        action: actionId,
                        tag: uniqueId || notification.notification.id
                    }
                }));
            });
        }
    }, []);

    const requestPermission = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            const result = await LocalNotifications.requestPermissions();
            setPermission(result.display);
            return result.display;
        } else {
            if (!('Notification' in window)) return 'denied';
            const result = await Notification.requestPermission();
            setPermission(result);
            return result;
        }
    }, []);

    const sendNotification = useCallback(async (title, options = {}) => {
        try {
            if (Capacitor.isNativePlatform()) {
                const isAlarm = options.soundType === 'alarm';
                await LocalNotifications.schedule({
                    notifications: [
                        {
                            title: title,
                            body: options.body || '',
                            id: new Date().getTime() % 2147483647,
                            schedule: { at: new Date(Date.now() + 100) },
                            sound: isAlarm ? 'alarm.wav' : 'chime.wav',
                            channelId: isAlarm ? 'reminders_alarm_v1' : 'reminders_v10',
                            smallIcon: 'ic_notification_bell',
                            actionTypeId: 'REMINDER_ACTIONS_V10', // Bind actions
                            extra: options.data || null
                        }
                    ]
                });
            } else {
                // Web fallback
                if ('serviceWorker' in navigator && Notification.permission === 'granted') {
                    const registration = await navigator.serviceWorker.ready;
                    await registration.showNotification(title, {
                        ...options,
                        icon: '/icon.png',
                        actions: [
                            { action: 'snooze', title: 'Snooze' },
                            { action: 'done', title: 'Mark as Done' }
                        ],
                        tag: options.data?.uniqueId,
                        data: options.data
                    });
                } else if (Notification.permission === 'granted') {
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
            if (!Capacitor.isNativePlatform()) return;

            let filteredCount = 0;
            let pastCount = 0;

            const globalSettings = dataService.getSettings();
            const globalSoundType = globalSettings?.notificationSound || 'standard';
            const isAlarm = globalSoundType === 'alarm';

            const notificationsToSchedule = reminders.map(r => {
                if (!r.displayTime) return null;
                const [h, m] = r.displayTime.split(':').map(Number);

                let date;
                if (r.targetDate) {
                    // TRUST THE TARGET DATE
                    const parts = r.targetDate.split(/[-/]/).map(Number);
                    if (parts.length === 3) {
                        const [year, month, day] = parts;
                        date = new Date(year, month - 1, day, h, m, 0, 0);
                    } else {
                        // Fallback logic
                        date = new Date();
                        date.setHours(h, m, 0, 0);
                    }
                } else {
                    // No target date? Assume today
                    date = new Date();
                    date.setHours(h, m, 0, 0);
                }

                const now = new Date();

                // CRITICAL FIX: Disable "Smart" rescheduling if we have an explicit target date.
                // If the date is passed, it's passed. Do not push it to tomorrow.
                if (!r.targetDate && date <= now) {
                    if (r.frequency === 'Daily') {
                        date.setDate(date.getDate() + 1);
                    }
                }

                // Generates ID
                let safeId;
                if (r.extra?.uniqueId || r.uniqueId) {
                    const uidStr = r.extra?.uniqueId || r.uniqueId;
                    let hash = 0;
                    for (let i = 0; i < uidStr.length; i++) {
                        hash = ((hash << 5) - hash) + uidStr.charCodeAt(i);
                        hash = hash & hash;
                    }
                    safeId = Math.abs(hash);
                } else {
                    safeId = (parseInt(r.id) + date.getTime()) & 0x7FFFFFFF;
                }

                const bodyText = r.instructions ? r.instructions : (r.type === 'Medication' ? 'Time for your meds!' : 'Reminder');

                // STRICT FILTER: Check if strictly in the past (tolerance 1 min)
                if (date.getTime() < now.getTime() - 60000) {
                    pastCount++;
                    return null;
                }

                return {
                    title: r.title,
                    body: bodyText,
                    id: safeId,
                    schedule: {
                        at: date,
                        allowWhileIdle: true
                    },
                    sound: isAlarm ? 'alarm.wav' : 'chime.wav',
                    channelId: isAlarm ? 'reminders_alarm_v1' : 'reminders_v10',
                    smallIcon: 'ic_notification_bell',
                    actionTypeId: 'REMINDER_ACTIONS_V10', // Ensure buttons appear
                    extra: { uniqueId: r.uniqueId }
                };
            });

            const filtered = notificationsToSchedule.filter(n => n !== null && !isNaN(n.id));

            if (filtered.length > 0) {
                // Cancel existing to prevent duplicates/ghosts
                const pending = await LocalNotifications.getPending();
                if (pending.notifications.length > 0) {
                    // Optimally we should only cancel relevant ones, but for now clear strictly to ensure clean slate
                    await LocalNotifications.cancel(pending);
                }

                await LocalNotifications.schedule({ notifications: filtered });
                console.log(`✅ Scheduled ${filtered.length} reminders.`);
            }

        } catch (error) {
            console.error("Scheduling Error:", error);
        }
    }, []);

    // Listener setup is now done in App.jsx to avoid hook duplication issues
    // Just return helpers
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
