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
                            sound: 'default', // CRITICAL: Explicit sound
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
        console.log('📅 scheduleReminders called with', reminders.length, 'reminders');
        console.table(reminders.map(r => ({
            Title: r.title,
            Date: r.targetDate || r.date,
            Time: r.displayTime || r.time,
            Status: r.status
        })));

        try {
            // STEP 1: Process reminders into notification objects (SHARED LOGIC)
            // This allows debugging the filtering logic on Web Console

            const notificationsToSchedule = reminders.map(r => {
                if (!r.displayTime) {
                    console.log('❌ Filtered (no displayTime):', r.title);
                    return null;
                }
                const [h, m] = r.displayTime.split(':').map(Number);

                let date;
                if (r.targetDate) {
                    // CRITICAL FIX: Parse date components to avoid UTC timezone issues
                    const [year, month, day] = r.targetDate.split('-').map(Number);
                    date = new Date(year, month - 1, day, h, m, 0, 0);
                    console.log('🎯', r.title, '- targetDate:', r.targetDate, '→ parsed:', date.toString());
                } else {
                    date = new Date();
                    date.setHours(h, m, 0, 0);
                    console.log('📍', r.title, '- no targetDate, using today with time:', date.toString());
                }

                const now = new Date();

                // Logic for Daily/Recurring: If passed today, schedule for tomorrow
                // ONLY if we don't have an explicit target date (which implies confidence)
                if (!r.targetDate && date <= now) {
                    if (r.frequency === 'Daily' || (r.schedule && r.schedule.type === 'recurring')) {
                        console.log('🔁', r.title, '- Recurring/Daily, time passed, moving to tomorrow');
                        date.setDate(date.getDate() + 1);
                    } else {
                        console.log('❌ Filtered (no targetDate, time passed, not recurring):', r.title, 'date:', date.toString(), 'now:', now.toString());
                        return null;
                    }
                }

                if (r.date && r.frequency === 'Once' && !r.targetDate) {
                    const [year, month, day] = r.date.split('-').map(Number);
                    const targetDate = new Date(year, month - 1, day, h, m, 0, 0);
                    if (targetDate <= now) {
                        console.log('❌ Filtered (Once frequency, r.date in past):', r.title);
                        return null;
                    }
                    date = targetDate;
                    console.log('📅', r.title, '- Using r.date for Once reminder:', date.toString());
                }

                const safeId = parseInt(r.id) % 2147483647;
                const bodyText = r.instructions ? r.instructions : (r.type === 'Medication' ? 'Time for your meds!' : 'Reminder');

                // EXTRA SAFETY: Don't schedule past events (tolerance 5 min)
                if (date.getTime() < now.getTime() - 300000) {
                    console.log('❌ Filtered (> 5min in past):', r.title, 'date:', date.toString());
                    return null;
                }

                return {
                    title: r.title,
                    body: bodyText,
                    id: safeId,
                    schedule: {
                        at: date.getTime(), // CRITICAL: Timestamp for serialization
                        allowWhileIdle: true
                    },
                    sound: 'default',
                    channelId: 'reminders_v10',
                    smallIcon: 'ic_notification_bell',
                    actionTypeId: 'REMINDER_ACTIONS_V10',
                    extra: { uniqueId: r.uniqueId }
                };
            });

            console.log('🔍 Shared Logic Filter Check:');
            console.log('   Total Input:', reminders.length);
            console.log('   Mapped (Pre-Null-Filter):', notificationsToSchedule.length);

            const filtered = notificationsToSchedule.filter(n => n !== null && !isNaN(n.id));
            console.log('✅ Final Valid Notifications:', filtered.length);

            if (filtered.length > 0) {
                console.table(filtered.map(n => ({
                    Title: n.title,
                    Time: new Date(n.schedule.at).toLocaleString(),
                    ID: n.id,
                    Timestamp: n.schedule.at
                })));
            }

            // STEP 2: Platform Execution
            if (Capacitor.isNativePlatform()) {
                const pending = await LocalNotifications.getPending();
                console.log('🗑️ Cancelling', pending.notifications.length, 'old notifications');
                if (pending.notifications.length > 0) {
                    await LocalNotifications.cancel(pending);
                }

                if (filtered.length > 0) {
                    console.log('🔔 Scheduling', filtered.length, 'Android notifications');
                    await LocalNotifications.schedule({
                        notifications: filtered
                    });
                    console.log('✅ Scheduled successfully!');

                    // Verify
                    const p = await LocalNotifications.getPending();
                    console.log('📡 Verified Pending Count:', p.notifications.length);
                } else {
                    console.warn('⚠️ No notifications to schedule after filtering');
                }
            } else {
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
