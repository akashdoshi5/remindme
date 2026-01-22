import { useState, useCallback, useEffect } from 'react';

export const useNotifications = () => {
    const [permission, setPermission] = useState(Notification.permission);
    const [registration, setRegistration] = useState(null);

    // Register SW
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => {
                    setRegistration(reg);
                    console.log('SW Registered');
                })
                .catch(err => console.error('SW Registration failed', err));

            // Listen for messages from SW (Snooze/Done)
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data && event.data.action) {
                    // Dispatch a custom event that App.jsx can listen to
                    const customEvent = new CustomEvent('notification-action', {
                        detail: { action: event.data.action, tag: event.data.tag }
                    });
                    window.dispatchEvent(customEvent);
                }
            });
        }
    }, []);

    const requestPermission = useCallback(async () => {
        if (!('Notification' in window)) {
            console.warn('This browser does not support desktop notification');
            return 'denied';
        }

        const result = await Notification.requestPermission();
        setPermission(result);
        return result;
    }, []);

    const sendNotification = useCallback((title, options = {}) => {
        if (permission === 'granted') {
            // Use SW if available (Better mobile support for actions)
            if (registration) {
                registration.showNotification(title, {
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    actions: [
                        { action: 'snooze', title: 'Snooze' },
                        { action: 'done', title: 'Mark as Done' }
                    ],
                    data: { url: window.location.href }, // Backup data
                    ...options
                });
            } else {
                // Fallback
                new Notification(title, {
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    actions: [
                        { action: 'snooze', title: 'Snooze' },
                        { action: 'done', title: 'Mark as Done' }
                    ],
                    ...options
                });
            }
        } else {
            console.warn('Notification permission not granted');
        }
    }, [permission, registration]);

    return {
        permission,
        requestPermission,
        sendNotification
    };
};
