import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataService } from '../services/data';
import { firestoreService } from '../services/firestoreService';

// Mock dependencies
vi.mock('../services/firestoreService', () => ({
    firestoreService: {
        migrateLocalData: vi.fn().mockResolvedValue(true),
        getRemindersRealtime: vi.fn(),
        getNotesRealtime: vi.fn(),
    }
}));

vi.mock('../services/firebase', () => ({
    auth: { currentUser: null },
    db: {},
    storage: {}
}));

// Constants from data.js
const BASE_KEY = 'remindme_buddy_db';
const GUEST_KEY = `${BASE_KEY}_guest`;

describe('Data Persistence & Integrity', () => {
    beforeEach(async () => {
        localStorage.clear();
        vi.clearAllMocks();
        // Reset internal state to guest
        await dataService.setUserId(null);
    });

    it('Should Auto-Migrate Guest Data when logging in as new user', async () => {
        // 1. Setup: Guest Data in Local Storage
        const guestData = {
            reminders: [{ id: '1', title: 'Local Reminder' }],
            notes: [{ id: 'n1', title: 'Local Note' }]
        };
        localStorage.setItem(GUEST_KEY, JSON.stringify(guestData));

        // 2. Action: Login
        const userId = 'user_unique_1';
        await dataService.setUserId(userId);

        // 3. Verify:
        // migrateLocalData should be called with the guest data
        expect(firestoreService.migrateLocalData).toHaveBeenCalledWith(
            expect.objectContaining({ reminders: expect.arrayContaining([expect.objectContaining({ id: '1' })]) })
        );

        // And Guest Data should be cleared (eventually)
        // Note: verify async clearing if needed, but the call is the critical part
        await new Promise(resolve => setTimeout(resolve, 0)); // tick
        expect(localStorage.getItem(GUEST_KEY)).toBeNull();
    });

    it('Should trigger Sync-Up if local data exists for authenticated user', async () => {
        // 1. Setup: Data exists for an authenticated user (e.g. offline edits)
        const userId = 'user_abc';
        // IMPORTANT: data.js uses `${BASE_STORAGE_KEY}_${currentUserId}`
        const userKey = `${BASE_KEY}_${userId}`;

        const localData = {
            reminders: [{ id: 'r_offline', title: 'Offline Reminder' }],
            notes: [],
            settings: {}
        };
        localStorage.setItem(userKey, JSON.stringify(localData));

        // 2. Action: Initialize/Set User
        await dataService.setUserId(userId);

        // 3. Expectation: The Service should attempt to upload this data to Cloud
        // This is where "Wipe" logic would fail, but "Sync-Up" logic succeeds.
        expect(firestoreService.migrateLocalData).toHaveBeenCalledWith(expect.objectContaining({
            reminders: expect.arrayContaining([expect.objectContaining({ id: 'r_offline' })])
        }));
    });
});
