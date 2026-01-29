import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export const initializeNotifications = async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
        console.log("Initializing Notifications (V5)...");

        // 1. Request Permissions
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
            await LocalNotifications.requestPermissions();
        }

        // 2. Register Action Types (Buttons) - V5
        try {
            await LocalNotifications.registerActionTypes({
                types: [{
                    id: 'REMINDER_ACTIONS_V5',
                    actions: [
                        {
                            id: 'snooze',
                            title: 'Snooze',
                            foreground: false
                        },
                        {
                            id: 'done',
                            title: 'Mark as Done',
                            foreground: false
                        }
                    ]
                }]
            });
            console.log("Action Types V5 Registered");
        } catch (e) {
            console.error("Error registering action types:", e);
        }

        // 3. Create Channel - V5
        try {
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
            console.log("Channel V5 Created");
        } catch (e) {
            console.error("Error creating channel:", e);
        }

        console.log("Notifications Initialized (V5)");
    } catch (error) {
        console.error("Failed to initialize notifications:", error);
    }
};
