import { useState, useCallback, useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export const useNotifications = () => {
    const [permission, setPermission] = useState('default');

    // Initialize Channels
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            // Channel 1: Standard Reminders (Default Sound)
            LocalNotifications.createChannel({
                id: 'reminders_v10',
                name: 'Reminders',
                description: 'General reminders',
                importance: 4,
                visibility: 1,
                sound: 'default_notification.ogg', // System Default
                vibration: true
            }).catch(e => console.error("Channel Create Error", e));

            // Channel 2: Important/Alarm Reminders (Long Sound)
            LocalNotifications.createChannel({
                id: 'reminders_alarm_v1',
                name: 'Alarm Reminders',
                description: 'High priority reminders preventing sleep',
                importance: 5, // High
                visibility: 1,
                sound: 'alarm_sound.ogg', // We will try to rely on system alarm sound or fallback
                vibration: true
            }).catch(e => console.error("Alarm Channel Create Error", e));
        }
    }, []);

    const requestPermission = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            const result = await LocalNotifications.requestPermissions();
            setPermission(result.display);
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
                const isAlarm = options.soundType === 'alarm';
                await LocalNotifications.schedule({
                    notifications: [
                        {
                            title: title,
                            body: options.body || '',
                            id: new Date().getTime() % 2147483647,
                            schedule: { at: new Date(Date.now() + 100) },
                            sound: isAlarm ? 'alarm_sound.ogg' : 'default', // CRITICAL: Explicit sound
                            channelId: isAlarm ? 'reminders_alarm_v1' : 'reminders_v10',
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
        /* console.log('📅 scheduleReminders called with', reminders.length, 'reminders'); */

        try {
            // STEP 1: Process reminders into notification objects (SHARED LOGIC)
            let filteredCount = 0;
            let pastCount = 0;
            let firstFilterReason = "";

            const notificationsToSchedule = reminders.map(r => {
                if (!r.displayTime) {
                    filteredCount++;
                    return null;
                }
                const [h, m] = r.displayTime.split(':').map(Number);

                let date;
                if (r.targetDate) {
                    // CRITICAL FIX: Parse using regex to handle YYYY-MM-DD or YYYY/MM/DD
                    const parts = r.targetDate.split(/[-/]/).map(Number);
                    // Ensure we have 3 parts [Year, Month, Day]
                    if (parts.length === 3) {
                        const [year, month, day] = parts;
                        date = new Date(year, month - 1, day, h, m, 0, 0);
                    } else {
                        // Fallback if parsing failed
                        console.error('Invalid targetDate format:', r.targetDate);
                        date = new Date(); // unsafe default but prevents crash
                        date.setHours(h, m, 0, 0);
                        filteredCount++;
                        if (!firstFilterReason) firstFilterReason = `Invalid Date Format (${r.targetDate})`;
                        return null; // Skip invalid dates
                    }
                } else {
                    date = new Date();
                    date.setHours(h, m, 0, 0);
                }

                const now = new Date();

                // Logic for Daily/Recurring: If passed today, schedule for tomorrow
                // ONLY if we don't have an explicit target date (which implies confidence)
                if (!r.targetDate && date <= now) {
                    if (r.frequency === 'Daily' || (r.schedule && r.schedule.type === 'recurring')) {
                        date.setDate(date.getDate() + 1);
                    } else {
                        filteredCount++;
                        if (!firstFilterReason) firstFilterReason = `Passed & Not Recurring (${r.title})`;
                        return null;
                    }
                }

                if (r.date && r.frequency === 'Once' && !r.targetDate) {
                    const [year, month, day] = r.date.split('-').map(Number);
                    const targetDate = new Date(year, month - 1, day, h, m, 0, 0);
                    if (targetDate <= now) {
                        filteredCount++;
                        if (!firstFilterReason) firstFilterReason = `Once & Passed (${r.title})`;
                        return null;
                    }
                    date = targetDate;
                }

                // CRITICAL FIX: Generate unique numeric ID for each instance
                // Prevents overwriting recurring reminders (which share the same base r.id)
                let safeId;
                if (r.extra?.uniqueId || r.uniqueId) {
                    const uidStr = r.extra?.uniqueId || r.uniqueId;
                    let hash = 0;
                    for (let i = 0; i < uidStr.length; i++) {
                        const char = uidStr.charCodeAt(i);
                        hash = ((hash << 5) - hash) + char;
                        hash = hash & hash; // Convert to 32bit integer
                    }
                    safeId = Math.abs(hash); // Ensure positive ID
                } else {
                    // Fallback to time-based unique ID if uniqueId is missing
                    safeId = (parseInt(r.id) + date.getTime()) & 0x7FFFFFFF;
                }

                const bodyText = r.instructions ? r.instructions : (r.type === 'Medication' ? 'Time for your meds!' : 'Reminder');

                // EXTRA SAFETY: Don't schedule past events (tolerance 5 min)
                if (date.getTime() < now.getTime() - 300000) {
                    pastCount++;
                    if (!firstFilterReason) firstFilterReason = `>5min Past (${r.title} @ ${date.toLocaleTimeString()})`;
                    return null;
                }

                // CHECK END DATE (Soft Delete / Expiry)
                if (r.schedule?.endDate) {
                    const end = new Date(r.schedule.endDate);
                    end.setHours(23, 59, 59, 999);
                    if (date > end) {
                        filteredCount++;
                        if (!firstFilterReason) firstFilterReason = `Past End Date (${r.title})`;
                        return null;
                    }
                }

                return {
                    title: r.title,
                    body: bodyText,
                    id: safeId,
                    schedule: {
                        at: date, // CRITICAL FIX: Must be Date object for Native Bridge
                        allowWhileIdle: true
                    },
                    sound: r.soundType === 'alarm' ? 'alarm_sound.ogg' : 'default', // Fallback to safe system default if file missing
                    channelId: r.soundType === 'alarm' ? 'reminders_alarm_v1' : 'reminders_v10',
                    smallIcon: 'ic_notification_bell',
                    actionTypeId: 'REMINDER_ACTIONS_V10',
                    extra: { uniqueId: r.uniqueId }
                };
            });

            const filtered = notificationsToSchedule.filter(n => n !== null && !isNaN(n.id));

            if (filtered.length === 0 && reminders.length > 0) {
                console.warn(`Debug: 0/${reminders.length} scheduled. Filtered: ${filteredCount}, Past: ${pastCount}. First Reason: ${firstFilterReason}`);
            }

            // STEP 2: Platform Execution
            if (Capacitor.isNativePlatform()) {
                const pending = await LocalNotifications.getPending();
                if (pending.notifications.length > 0) {
                    await LocalNotifications.cancel(pending);
                }

                if (filtered.length > 0) {
                    try {
                        await LocalNotifications.schedule({
                            notifications: filtered
                        });
                    } catch (schedError) {
                        console.error(`Native Schedule Failed: ${schedError.message}`);
                    }

                    // Verify
                    const p = await LocalNotifications.getPending();
                    if (p.notifications.length === 0) {
                        console.error('CRITICAL: Native says success but 0 pending found! Check Logcat.');
                    }
                }
            } else {
                // Web platform logic could go here
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
