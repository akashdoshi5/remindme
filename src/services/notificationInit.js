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

        // 2. Register Action Types (Buttons) - V6
        try {
            await LocalNotifications.registerActionTypes({
                types: [{
                    id: 'REMINDER_ACTIONS_V6',
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
            console.log("Action Types V6 Registered");
        } catch (e) {
            console.error("Error registering action types:", e);
        }

        // 3. Create Channel - V9 (Migration for Icon/Sound)
        try {
            await LocalNotifications.createChannel({
                id: 'reminders_v9',
                name: 'Reminders (Sound & Priority)',
                description: 'Medication and Important Reminders',
                importance: 5,
                visibility: 1,
                sound: 'default', // Explicitly request default sound
                vibration: true,
                lights: true,
            });
            console.log("Channel V9 Created");
        } catch (e) {
            console.error("Error creating channel:", e);
        }

        console.log("Notifications Initialized (V5)");
    } catch (error) {
        console.error("Failed to initialize notifications:", error);
    }
};
