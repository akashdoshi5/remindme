import { useEffect } from 'react';
import { dataService } from '../services/data';
import { useAuth } from '../context/AuthContext';

/**
 * useDataSync — Sets up data context for the current user.
 * 
 * All realtime Firestore listeners are managed inside dataService.setUserId()
 * which uses smart-merge logic for reminders (logs/exceptions) and notes
 * (cloud-wins for content, local-wins for isPinned, 5s in-flight protection).
 * 
 * Previously, this hook set up DUPLICATE listeners that called syncFromCloud()
 * with simple-overwrite semantics, causing race conditions and data loss.
 * Now it only calls setUserId() which handles everything.
 */
export const useDataSync = () => {
    const { user } = useAuth();

    useEffect(() => {
        // Set Data Context — setUserId handles:
        // 1. Guest-to-user migration
        // 2. Local data migration to cloud (once per user)
        // 3. Fetching deleted note IDs for cross-device sync
        // 4. Setting up ALL realtime listeners with smart merge
        dataService.setUserId(user ? user.uid : null);

        // No additional listeners needed — setUserId manages cleanup internally
    }, [user]);
};
