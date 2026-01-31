
const r_hourly = {
    id: 'hourly_1',
    title: 'Hourly Test',
    type: 'Water',
    time: '12:00',
    frequency: 'Every 1 Hour',
    schedule: { startDate: '2026-01-31', durationDays: 30 }, // Today is 2026-01-31
    date: '2026-01-31'
};

const r_weekly_sat = {
    id: 'weekly_1',
    title: 'Weekly Sat',
    frequency: 'Weekly',
    schedule: { startDate: '2026-01-31', durationDays: 30 }, // Started today (Sat)
    date: '2026-01-31',
    time: '10:00'
};

const r_weekly_fri = {
    id: 'weekly_2',
    title: 'Weekly Fri',
    frequency: 'Weekly',
    schedule: { startDate: '2026-01-30', durationDays: 30 }, // Started yesterday (Fri)
    date: '2026-01-30',
    time: '10:00'
};

const r_custom_sat = {
    id: 'custom_1',
    title: 'Custom Sat',
    frequency: 'Sat, Sun',
    schedule: { startDate: '2026-01-01', durationDays: 300 },
    date: '2026-01-01',
    time: '09:00'
};

const r_custom_mon = {
    id: 'custom_2',
    title: 'Custom Mon',
    frequency: 'Mon, Wed',
    schedule: { startDate: '2026-01-01', durationDays: 300 },
    date: '2026-01-01',
    time: '09:00'
};

const targetDate = '2026-01-31'; // Saturday
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = weekDays[new Date(targetDate).getDay()];

console.log(`Testing for Date: ${targetDate} (${dayName})`);

function checkShow(r, dateString) {
    let show = false;

    // Logic from data.js
    if (r.frequency && r.frequency.startsWith('Every')) show = true;
    else if (r.frequency === 'Daily') show = true;
    else if (r.frequency === 'Today') show = (r.date === dateString);
    else if (r.date === dateString) show = true; // Simple single match

    // Weekly Logic (mimicking what MIGHT be missing or broken)
    // The current code in data.js mainly relied on:
    // else if (r.frequency === 'Daily') show = true;
    // else if (r.date === dateString) show = true;

    // ... wait, where is the Weekly logic? 
    // If it's not explicitly handled, it falls to `r.date === dateString` which is only true for the START date.

    if (r.frequency === 'Weekly') {
        // Checking if we are adding logic here or if it exists
        const start = new Date(r.schedule?.startDate || r.date);
        const current = new Date(dateString);
        const diffDays = Math.floor((current - start) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays % 7 === 0) show = true;
    }

    // Custom Logic
    if (r.frequency && (r.frequency.includes(',') || weekDays.some(d => r.frequency.includes(d)))) {
        // Logic for custom days
        const currentDayName = weekDays[new Date(dateString).getDay()];
        if (r.frequency.includes(currentDayName)) show = true;
    }

    console.log(`[${r.title}] Show: ${show}`);
    return show;
}

[r_hourly, r_weekly_sat, r_weekly_fri, r_custom_sat, r_custom_mon].forEach(r => checkShow(r, targetDate));
