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
        /* console.log('📅 scheduleReminders called with', reminders.length, 'reminders'); */

        try {
            // STEP 1: Process reminders into notification objects (SHARED LOGIC)
            // This allows debugging the filtering logic on Web Console

            let filteredCount = 0;
            let pastCount = 0;
            let invalidCount = 0;
            let firstFilterReason = "";

            const notificationsToSchedule = reminders.map(r => {
                if (!r.displayTime) {
                    filteredCount++;
                    /* console.log('❌ Filtered (no displayTime):', r.title); */
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
                        /* console.log('🎯', r.title, '- targetDate:', r.targetDate, '→ parsed:', date.toString()); */
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
                    /* console.log('📍', r.title, '- no targetDate, using today with time:', date.toString()); */
                }

                const now = new Date();

                // Logic for Daily/Recurring: If passed today, schedule for tomorrow
                // ONLY if we don't have an explicit target date (which implies confidence)
                if (!r.targetDate && date <= now) {
                    if (r.frequency === 'Daily' || (r.schedule && r.schedule.type === 'recurring')) {
                        /* console.log('🔁', r.title, '- Recurring/Daily, time passed, moving to tomorrow'); */
                        date.setDate(date.getDate() + 1);
                    } else {
                        filteredCount++;
                        if (!firstFilterReason) firstFilterReason = `Passed & Not Recurring (${r.title})`;
                        /* console.log('❌ Filtered (no targetDate, time passed, not recurring):', r.title); */
                        return null;
                    }
                }

                if (r.date && r.frequency === 'Once' && !r.targetDate) {
                    const [year, month, day] = r.date.split('-').map(Number);
                    const targetDate = new Date(year, month - 1, day, h, m, 0, 0);
                    if (targetDate <= now) {
                        filteredCount++;
                        if (!firstFilterReason) firstFilterReason = `Once & Passed (${r.title})`;
                        /* console.log('❌ Filtered (Once frequency, r.date in past):', r.title); */
                        return null;
                    }
                    date = targetDate;
                    /* console.log('📅', r.title, '- Using r.date for Once reminder:', date.toString()); */
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

                // const safeId = parseInt(r.id) % 2147483647; // OLD BROKEN logic
                const bodyText = r.instructions ? r.instructions : (r.type === 'Medication' ? 'Time for your meds!' : 'Reminder');

                // EXTRA SAFETY: Don't schedule past events (tolerance 5 min)
                if (date.getTime() < now.getTime() - 300000) {
                    pastCount++;
                    if (!firstFilterReason) firstFilterReason = `>5min Past (${r.title} @ ${date.toLocaleTimeString()})`;
                    /* console.log('❌ Filtered (> 5min in past):', r.title, 'date:', date.toString()); */
                    return null;
                }

                // CHECK END DATE (Soft Delete / Expiry)
                if (r.schedule?.endDate) {
                    const end = new Date(r.schedule.endDate);
                    end.setHours(23, 59, 59, 999);
                    if (date > end) {
                        /* console.log('❌ Filtered (Past End Date):', r.title); */
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
                    sound: 'default',
                    channelId: 'reminders_v10',
                    smallIcon: 'ic_notification_bell',
                    actionTypeId: 'REMINDER_ACTIONS_V10',
                    extra: { uniqueId: r.uniqueId }
                };
            });

            /* console.log('🔍 Shared Logic Filter Check:'); */
            /* console.log('   Total Input:', reminders.length); */
            /* console.log('   Mapped (Pre-Null-Filter):', notificationsToSchedule.length); */

            const filtered = notificationsToSchedule.filter(n => n !== null && !isNaN(n.id));
            /* console.log('✅ Final Valid Notifications:', filtered.length); */

            if (filtered.length === 0 && reminders.length > 0) {
                console.warn(`Debug: 0/${reminders.length} scheduled. Filtered: ${filteredCount}, Past: ${pastCount}. First Reason: ${firstFilterReason}`);
            } else if (filtered.length > 0) {
                // alert(`Debug: Prepared ${filtered.length} notifications. First: ${filtered[0].title} @ ${new Date(filtered[0].schedule.at).toLocaleTimeString()}`);
            }

            if (filtered.length > 0) {
                /*
                console.table(filtered.map(n => ({
                    Title: n.title,
                    Time: new Date(n.schedule.at).toLocaleString(),
                    ID: n.id,
                    Timestamp: n.schedule.at
                })));
                */
            }

            // STEP 2: Platform Execution
            if (Capacitor.isNativePlatform()) {
                const pending = await LocalNotifications.getPending();
                /* console.log('🗑️ Cancelling', pending.notifications.length, 'old notifications'); */
                if (pending.notifications.length > 0) {
                    await LocalNotifications.cancel(pending);
                }

                if (filtered.length > 0) {
                    /* console.log('🔔 Scheduling', filtered.length, 'Android notifications'); */
                    try {
                        const result = await LocalNotifications.schedule({
                            notifications: filtered
                        });
                        // alert(`Success! Scheduled ${filtered.length}.`);
                    } catch (schedError) {
                        console.error(`Native Schedule Failed: ${schedError.message}`);
                    }
                    /* console.log('✅ Scheduled successfully!'); */

                    // Verify
                    const p = await LocalNotifications.getPending();
                    /* console.log('📡 Verified Pending Count:', p.notifications.length); */
                    if (p.notifications.length === 0) {
                        if (p.notifications.length === 0) {
                            console.error('CRITICAL: Native says success but 0 pending found! Check Logcat.');
                        }
                    }
                } else {
                    /* console.warn('⚠️ No notifications to schedule after filtering'); */
                }
            } else {
                // ...
                console.log("Web Scheduling: Browser requires open tab. Relying on useReminders Polling for now.");
            }

        } catch (error) {
            console.error("Scheduling Error:", error);
            console.error("Scheduling Error:", error);
            // alert("General Schedule Error: " + error.message);
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
