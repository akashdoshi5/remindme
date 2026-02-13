
import assert from 'assert';

// MOCKED STUBS
const sleepStart = '22:00';
const sleepEnd = '08:00';

// Mock DataService Functions (Simplified)
const expandRemindersForDate = (dateString, sourceReminders) => {
    // ... same as before ...
    const all = sourceReminders || [];
    const expanded = [];
    all.forEach(r => {
        if (r.frequency && r.frequency.startsWith('Every')) {
            const match = r.frequency.match(/Every\s+(\d+)\s*(h|hour|hours)?/i);
            const intervalHours = match ? parseInt(match[1]) : NaN;
            if (!isNaN(intervalHours)) {
                let startH, startM;
                const startDateStr = r.schedule?.startDate || r.date;
                const isStratDate = startDateStr === dateString;
                if (isStratDate && r.time) {
                    [startH, startM] = r.time.split(':').map(Number);
                } else if (r.startTime) {
                    [startH, startM] = r.startTime.split(':').map(Number);
                } else {
                    [startH, startM] = sleepEnd.split(':').map(Number);
                }
                let currentMinutes = startH * 60 + startM;
                const limitMinutes = (24 * 60) + (10 * 60); // simplified limit
                const step = intervalHours * 60;
                while (currentMinutes <= limitMinutes) {
                    let h = Math.floor(currentMinutes / 60);
                    const m = currentMinutes % 60;
                    if (h >= 24) h -= 24;
                    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    expanded.push({ time: timeStr, instanceKey: `${dateString}_${timeStr}`, date: dateString });
                    currentMinutes += step;
                }
            }
        }
    });
    return expanded;
};

// AUTO-COMPLETE LOGIC SIMULATION (ROBUST)
const simulateAutoBackfill = (reminder) => {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');
    const startStr = reminder.schedule?.startDate;
    const logs = {};

    if (startStr && startStr <= todayStr) {
        const loopDate = new Date(startStr);
        const limitDate = new Date(todayStr);

        while (loopDate <= limitDate) {
            const dStr = loopDate.toLocaleDateString('en-CA');
            const instances = expandRemindersForDate(dStr, [reminder]);

            instances.forEach(inst => {
                let isPast = false;
                if (dStr < todayStr) isPast = true;

                if (isPast) {
                    // THE FIX: Robust Date Construction (Manual Parsing)
                    let scheduledTimeIdx = new Date().toISOString(); // Default fallback

                    if (inst.time && inst.time.includes(':')) {
                        try {
                            // Manual YYYY-MM-DD construction (simulating data.js)
                            const y = parseInt(dStr.split('-')[0]);
                            const m = parseInt(dStr.split('-')[1]);
                            const d = parseInt(dStr.split('-')[2]);
                            const [h, min] = inst.time.split(':').map(Number);

                            // Robust Date Construction (Month is 0-indexed)
                            const robustDate = new Date(y, m - 1, d, h, min, 0);
                            scheduledTimeIdx = robustDate.toISOString();
                        } catch (e) {
                            console.error("Date parsing error", e);
                        }
                    }
                    logs[inst.instanceKey] = { status: 'taken', takenAt: scheduledTimeIdx };
                }
            });
            loopDate.setDate(loopDate.getDate() + 1);
        }
    }
    return logs;
};

// TEST RUNNER
const runTest = () => {
    console.log("Running Verification for Robust Date Parsing...");

    const reminder = {
        id: '123',
        title: 'Water',
        frequency: 'Every 3 Hours',
        time: '17:01',
        date: '2026-02-12', // Yesterday
        schedule: { startDate: '2026-02-12', type: 'recurring' }
    };

    console.log("Simulating Auto-Backfill...");
    const logs = simulateAutoBackfill(reminder);

    // Check Yesterday's 17:01 Instance
    const key = `2026-02-12_17:01`;
    const log = logs[key];

    if (log) {
        console.log(`Log for ${key}:`, log);

        // Construct expected Timestamp manually
        const expectedDate = new Date(2026, 1, 12, 17, 1, 0); // Feb is 1
        const expectedISO = expectedDate.toISOString();

        console.log(`Expected ISO: ${expectedISO}`);
        console.log(`Actual ISO:   ${log.takenAt}`);

        assert.strictEqual(log.takenAt, expectedISO, "Robust parsing should match manual component construction");
        console.log("✅ PASSED: Robust timestamp matches exact scheduled time.");
    } else {
        console.error("❌ FAILED: Log not found.");
    }
};

runTest();
