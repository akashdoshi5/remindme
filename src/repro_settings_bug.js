
const r = {
    id: 'test_water_bad_settings',
    title: 'Water',
    time: '15:00', // 3:00 PM
    frequency: 'Every 1 Hour',
    schedule: { startDate: '2026-01-31', durationDays: 30 },
    date: '2026-01-31'
};

const dateString = '2026-01-31';

// SCENARIO 1: User set Sleep Start to "10:00" (10 AM) instead of "22:00" (10 PM)
// They start reminders at 3 PM.
const badSettings = { sleepStart: '10:00', sleepEnd: '08:00' };

function generate(r, dateString, settings) {
    const times = [];
    if (r.frequency && r.frequency.startsWith('Every')) {
        const match = r.frequency.match(/Every\s+(\d+)\s*(h|hour|hours)?/i);
        const intervalHours = match ? parseInt(match[1]) : NaN;

        if (!isNaN(intervalHours)) {
            const sleepStart = (settings.sleepStart && settings.sleepStart.includes(':')) ? settings.sleepStart : '22:00';
            const sleepEnd = (settings.sleepEnd && settings.sleepEnd.includes(':')) ? settings.sleepEnd : '08:00';

            let startH, startM;
            const startDateStr = r.schedule?.startDate || r.date;

            // Simplified: Assuming we are on start date for this test
            if (r.time && startDateStr === dateString) {
                [startH, startM] = r.time.split(':').map(Number);
            } else {
                [startH, startM] = sleepEnd.split(':').map(Number);
            }

            const [limitH, limitM] = sleepStart.split(':').map(Number);
            let limitMinutes = limitH * 60 + limitM;
            let currentMinutes = startH * 60 + startM;

            console.log(`Start: ${startH}:${startM} (${currentMinutes}), Limit: ${limitH}:${limitM} (${limitMinutes})`);
            console.log(`Will loop run? ${currentMinutes <= limitMinutes}`);

            const step = intervalHours * 60;
            if (step > 0) {
                while (currentMinutes <= limitMinutes) {
                    const h = Math.floor(currentMinutes / 60);
                    const m = currentMinutes % 60;
                    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    times.push(timeStr);
                    currentMinutes += step;
                }

                // Fallback logic from data.js
                if (times.length === 0 && startDateStr === dateString && r.time) {
                    times.push(r.time);
                    console.log("Fallback triggered!");
                }
            }
        }
    }
    return times;
}

console.log("--- Test Case: Sleep Start 10:00 AM, Reminder Start 3:00 PM ---");
const result = generate(r, dateString, badSettings);
console.log("Result:", result);
