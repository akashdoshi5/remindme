import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * HapticsService - Centralized vibration controller
 * 
 * Uses @capacitor/haptics for UI feedback (Taptic Engine / crisp motors)
 * Uses navigator.vibrate for Alarms (longer, custom patterns)
 */
export const haptics = {
    // --- UI FEEDBACK (Crisp, Short) ---

    /**
     * Subtle tick for toggles, switches, weak buttons
     */
    light: async () => {
        try {
            await Haptics.impact({ style: ImpactStyle.Light });
        } catch (e) {
            // Fallback for web if needed, but usually we just ignore
        }
    },

    /**
     * Standard click feedback for primary buttons (Save, add, etc)
     */
    medium: async () => {
        try {
            await Haptics.impact({ style: ImpactStyle.Medium });
        } catch (e) {
            if (navigator.vibrate) navigator.vibrate(10);
        }
    },

    /**
     * Heavy impact for destructive actions (Delete) or major state changes
     */
    heavy: async () => {
        try {
            await Haptics.impact({ style: ImpactStyle.Heavy });
        } catch (e) {
            if (navigator.vibrate) navigator.vibrate(20);
        }
    },

    /**
     * Success feedback (Double tap usually)
     */
    success: async () => {
        try {
            await Haptics.notification({ type: NotificationType.Success });
        } catch (e) {
            if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
        }
    },

    /**
     * Error/Warning feedback (Triple tap usually)
     */
    error: async () => {
        try {
            await Haptics.notification({ type: NotificationType.Error });
        } catch (e) {
            if (navigator.vibrate) navigator.vibrate([10, 50, 10, 50, 10]);
        }
    },

    /**
     * Selection change (Scroll wheels, pickers)
     */
    selection: async () => {
        try {
            await Haptics.selectionStart();
            await Haptics.selectionChanged();
            await Haptics.selectionEnd();
        } catch (e) {
            // No web fallback for selection
        }
    },


    // --- ALARMS & NOTIFICATIONS (Long, Attention Grabbing) ---

    /**
     * Aggressive Alarm Pattern
     * Pulse - Pause - Pulse - Pause - Long Pulse
     */
    alarm: () => {
        if (navigator.vibrate) {
            // [Vibrate, Pause, Vibrate, Pause, ...]
            // Double pattern: 500ms vibe, 200ms pause, 500ms vibe, 200ms pause, 1000ms vibe, 300ms pause, REPEAT
            navigator.vibrate([
                500, 200, 500, 200, 1000,
                300,
                500, 200, 500, 200, 1000
            ]);
        }
    },

    /**
     * Standard Notification Pattern (Double Buzz)
     */
    notification: () => {
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
    },

    /**
     * Stop all vibration
     */
    stop: () => {
        if (navigator.vibrate) navigator.vibrate(0);
    }
};
