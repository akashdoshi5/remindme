
const r = {
    id: 'test_water_tomorrow',
    title: 'Water',
    time: '15:05', // 3:05 PM
    frequency: 'Every 1 Hour',
    schedule: {
        startDate: '2026-01-31',
        durationDays: 30
    },
    date: '2026-01-31'
};

const todayStr = '2026-01-31';
const tomorrowStr = '2026-02-01';

// Mock Settings (Defaults)
const settings = { sleepStart: '22:00', sleepEnd: '08:00' };

function generate(r, dateString) {
    const times = [];
    if (r.frequency && r.frequency.startsWith('Every')) {
        const match = r.frequency.match(/Every\s+(\d+)\s+Hour/i);
        const intervalHours = match ? parseInt(match[1]) : NaN;

        console.log(`Date: ${dateString}, Interval: ${intervalHours}`);

        let startH, startM;
        const startDateStr = r.schedule?.startDate || r.date;

        if (r.time && startDateStr === dateString) {
            [startH, startM] = r.time.split(':').map(Number);
            console.log(` Using Start Time: ${startH}:${startM}`);
        } else {
            [startH, startM] = settings.sleepEnd.split(':').map(Number);
            console.log(` Using Sleep End: ${startH}:${startM}`);
        }

        const [limitH, limitM] = settings.sleepStart.split(':').map(Number);
        const limitMinutes = limitH * 60 + limitM;
        let currentMinutes = startH * 60 + startM;

        const step = intervalHours * 60;

        if (intervalHours && step > 0) {
            while (currentMinutes <= limitMinutes) {
                const h = Math.floor(currentMinutes / 60);
                const m = currentMinutes % 60;
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                times.push(timeStr);
                currentMinutes += step;
            }
        }
    }
    return times;
}

console.log("--- Today (Jan 31) ---");
console.log(generate(r, todayStr));

console.log("\n--- Tomorrow (Feb 1) ---");
console.log(generate(r, tomorrowStr));
