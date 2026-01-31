
const r = {
    id: 'test_rem_1',
    title: 'Water',
    type: 'Water',
    time: '14:00', // 2 PM
    frequency: 'Every 1 Hour',
    schedule: {
        startDate: '2025-01-31',
        durationDays: 30
    },
    date: '2025-01-31'
};

const dateString = '2025-01-31';

// Mock Settings (Defaults)
const settings = { sleepStart: '22:00', sleepEnd: '08:00' };

function generate(r, dateString) {
    if (r.frequency && r.frequency.startsWith('Every')) {
        const intervalHours = parseInt(r.frequency.split(' ')[1]);
        console.log(`Interval: ${intervalHours}`);

        let startH, startM;
        const startDateStr = r.schedule?.startDate || r.date;

        if (r.time && startDateStr === dateString) {
            [startH, startM] = r.time.split(':').map(Number);
            console.log(`Using Start Time: ${startH}:${startM}`);
        } else {
            [startH, startM] = settings.sleepEnd.split(':').map(Number);
            console.log(`Using Sleep End: ${startH}:${startM}`);
        }

        const [limitH, limitM] = settings.sleepStart.split(':').map(Number);
        const limitMinutes = limitH * 60 + limitM;
        let currentMinutes = startH * 60 + startM;
        console.log(`Limit Minutes: ${limitMinutes}`);
        console.log(`Start Minutes: ${currentMinutes}`);

        const step = intervalHours * 60;
        const times = [];

        if (step > 0) {
            while (currentMinutes < limitMinutes) {
                const h = Math.floor(currentMinutes / 60);
                const m = currentMinutes % 60;
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                times.push(timeStr);
                currentMinutes += step;
            }
        }
        return times;
    }
    return [r.time];
}

console.log("Output:", generate(r, dateString));
