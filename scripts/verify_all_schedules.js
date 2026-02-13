
// Verified Script for Schedule Logic

// --- MOCK LOGIC FROM data.js (Replicating for Verification) ---

function getDayName(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function expandReminders(reminder, dateStr) {
    const times = [];
    const [sy, sm, sd] = reminder.date.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);

    // CURRENT LOGIC (Verified Fix)
    const [cy, cm, cd] = dateStr.split('-').map(Number);
    const checkDate = new Date(cy, cm - 1, cd);

    let shouldAdd = false;

    if (reminder.frequency === 'Weekly') {
        if (startDate.getDay() === checkDate.getDay()) shouldAdd = true;
    } else if (reminder.frequency === 'Monthly') {
        if (sd === cd) shouldAdd = true;
    } else if (reminder.frequency && reminder.frequency.includes(',')) {
        // Custom
        const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'short' });
        if (reminder.frequency.includes(dayName)) shouldAdd = true;
    } else if (reminder.frequency === 'Daily') {
        shouldAdd = true;
    } else if (reminder.frequency.startsWith('Every')) {
        shouldAdd = true; // Always check Every X Hours

        let interval = parseInt(reminder.frequency.replace('Every ', '').replace(' Hours', ''));
        if (isNaN(interval)) interval = 2; // Default

        // Start Time Parsing
        // Day 1: User Time. Day 2+: 08:00 (Sleep End Reset Logic)
        let startHour = 8;
        let startMin = 0;
        if (reminder.date === dateStr) {
            const [h, m] = reminder.time.split(':').map(Number);
            startHour = h;
            startMin = m;
        }

        let currentMinutes = startHour * 60 + startMin;
        // End Time (Sleep): Default 22:00
        const limitMinutes = 22 * 60;

        while (currentMinutes <= limitMinutes) {
            let h = Math.floor(currentMinutes / 60);
            const m = currentMinutes % 60;
            if (h >= 24) h -= 24;
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            times.push(timeStr);
            currentMinutes += (interval * 60);
        }
        return times; // Return generated times
    } else if (reminder.frequency === 'Once') {
        if (reminder.date === dateStr) shouldAdd = true;
    }

    if (shouldAdd) {
        times.push(reminder.time || '09:00');
    }
    return times;
}

// --- TEST CASES ---

const reminders = [
    { id: 'weekly_rem', title: 'Weekly Fri', frequency: 'Weekly', date: '2026-02-13', time: '10:00' }, // Feb 13 2026 is Friday
    { id: 'monthly_rem', title: 'Monthly 13th', frequency: 'Monthly', date: '2026-02-13', time: '11:00' },
    { id: 'custom_rem', title: 'Mon, Wed', frequency: 'Mon, Wed', date: '2026-02-01', time: '12:00' },
    { id: 'interval_rem', title: 'Every 2h (Start 14:00)', frequency: 'Every 2 Hours', date: '2026-02-13', time: '14:00' }
];

const testDates = [
    '2026-02-13', // Fri (Start) -> Weekly=Yes, Monthly=Yes, Custom=No(Fri not in Mon/Wed), Interval=Yes(14:00 start)
    '2026-02-14', // Sat -> Weekly=No, Monthly=No, Custom=No, Interval=Yes(08:00 reset)
    '2026-02-16', // Mon -> Weekly=No, Monthly=No, Custom=Yes, Interval=Yes(08:00 reset)
    '2026-02-20', // Fri (Next Week) -> Weekly=Yes, Monthly=No, Custom=No, Interval=Yes
    '2026-03-13'  // Fri (Next Month) -> Weekly=Yes(Fri), Monthly=Yes(13th), Custom=No, Interval=Yes
];

console.log("--- STARTING SCHEDULE VERIFICATION ---\n");

testDates.forEach(dateStr => {
    // Determine weekday for log clarity
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

    console.log(`Checking Date: ${dateStr} (${dayName})`);

    reminders.forEach(r => {
        const slots = expandReminders(r, dateStr);
        if (slots.length > 0) {
            console.log(`  [${r.frequency}] "${r.title}": Scheduled at [${slots.join(', ')}]`);
        } else {
            // console.log(`  [${r.frequency}] "${r.title}": SKIP`);
        }
    });
    console.log("");
});

console.log("\n--- VERIFICATION COMPLETE ---");
