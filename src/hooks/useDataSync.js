import { useEffect } from 'react';
import { firestoreService } from '../services/firestoreService';
import { dataService } from '../services/data';
import { useAuth } from '../context/AuthContext';

export const useDataSync = () => {
    const { user } = useAuth();

    useEffect(() => {
        // 1. Set Data Context
        dataService.setUserId(user ? user.uid : null);

        if (!user) return;

        console.log("Initializing Data Sync for:", user.uid);

        // 2. Setup Listeners
        const unsubReminders = firestoreService.getRemindersRealtime((data) => {
            dataService.syncFromCloud('reminders', data);
            window.dispatchEvent(new Event('storage-update'));
        });

        // Combined Notes Listener
        let ownedNotes = [];
        let sharedNotes = [];

        const updateCombinedNotes = () => {
            // Merge unique notes
            const map = new Map();
            ownedNotes.forEach(n => map.set(n.id, n));
            sharedNotes.forEach(n => map.set(n.id, n));
            dataService.syncFromCloud('notes', Array.from(map.values()));
            window.dispatchEvent(new Event('storage-update'));
        };

        const unsubNotesOwned = firestoreService.getNotesRealtime((data) => {
            ownedNotes = data;
            updateCombinedNotes();
        });

        const unsubNotesShared = firestoreService.getSharedNotesRealtime((data) => {
            sharedNotes = data;
            updateCombinedNotes();
        });

        const unsubCaregivers = firestoreService.getCaregiversRealtime((data) => {
            dataService.syncFromCloud('caregivers', data);
            window.dispatchEvent(new Event('storage-update'));
        });

        const unsubSettings = firestoreService.getSettingsRealtime((data) => {
            dataService.syncFromCloud('settings', data);
            window.dispatchEvent(new Event('storage-update'));
        });

        // 3. Cleanup on Unmount/User Change
        return () => {
            console.log("Cleaning up Data Sync");
            unsubReminders();
            unsubNotesOwned();
            unsubNotesShared();
            unsubCaregivers();
            unsubSettings();
        };
    }, [user]); // Re-run ONLY if user changes
};
