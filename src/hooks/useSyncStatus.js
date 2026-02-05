import { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { waitForPendingWrites } from 'firebase/firestore';

export const useSyncStatus = () => {
    const [status, setStatus] = useState('synced'); // 'synced', 'syncing', 'offline'
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setStatus('synced'); // Optimistic
        };
        const handleOffline = () => {
            setIsOnline(false);
            setStatus('offline');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        // Listen for internal data update events (triggered by our optimistic UI)
        const handleDataUpdate = () => {
            if (isOnline) {
                setStatus('syncing');
                // Use Firestore's built-in promise to detect when writes are done
                // Note: waitForPendingWrites resolves when all local changes are sent
                waitForPendingWrites(db).then(() => {
                    setStatus('synced');
                }).catch(() => {
                    setStatus('offline'); // If it fails, likely offline
                });
            } else {
                setStatus('offline');
            }
        };

        window.addEventListener('data-updated', handleDataUpdate);
        window.addEventListener('storage-update', handleDataUpdate); // Also listen to storage updates

        return () => {
            window.removeEventListener('data-updated', handleDataUpdate);
            window.removeEventListener('storage-update', handleDataUpdate);
        };
    }, [isOnline]);

    return { status, isOnline };
};
