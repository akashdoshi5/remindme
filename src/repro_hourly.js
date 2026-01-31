
const r = {
    id: 'test_water',
    title: 'Water',
    time: '14:40',
    frequency: 'Every 1 Hour',
    schedule: {
        startDate: '2026-01-31',
        durationDays: 30
    },
    date: '2026-01-31'
};

const dateString = '2026-01-31';
const settings = { sleepStart: '22:00', sleepEnd: '08:00' };

function generate(r, dateString) {
    const times = [];
    if (r.frequency && r.frequency.startsWith('Every')) {
        const intervalHours = parseInt(r.frequency.split(' ')[1]);

        let startH, startM;
        const startDateStr = r.schedule?.startDate || r.date;

        if (r.time && startDateStr === dateString) {
            [startH, startM] = r.time.split(':').map(Number);
        } else {
            [startH, startM] = settings.sleepEnd.split(':').map(Number);
        }

        const [limitH, limitM] = settings.sleepStart.split(':').map(Number);
        const limitMinutes = limitH * 60 + limitM;
        let currentMinutes = startH * 60 + startM;

        const step = intervalHours * 60;

        console.log(`Debug: Start=${startH}:${startM} (${currentMinutes}), Limit=${limitH}:${limitM} (${limitMinutes}), Step=${step}`);

        if (step > 0) {
            while (currentMinutes <= limitMinutes) {
                const h = Math.floor(currentMinutes / 60);
                const m = currentMinutes % 60;
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                times.push(timeStr);
                currentMinutes += step;
            }
            // Fallback
            if (times.length === 0 && startDateStr === dateString && r.time) {
                times.push(r.time);
            }
        }
    }
    return times;
}

console.log("Times Generated:", generate(r, dateString));
