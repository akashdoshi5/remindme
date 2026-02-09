const fs = require('fs');
const path = 'src/services/data.js';
const data = fs.readFileSync(path, 'utf8');
const lines = data.split('\n');

const fullLogic = `    expandRemindersForDate: (dateString, sourceReminders, settings = {}) => {
        // dateString is YYYY-MM-DD
        const all = sourceReminders || [];
        const expanded = [];

        // Defaults
        const sleepStart = settings.sleepStart || '22:00';
        const sleepEnd = settings.sleepEnd || '08:00';

        // Helper for reliable date comparison (local strings)
        const getHealthDiffDays = (startStr, currentStr) => {
            const start = new Date(startStr);
            const current = new Date(currentStr);
            const diffTime = current - start;
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        };

        all.forEach(r => {
            // Universal Start Date & Duration Logic
            const univSchedule = r.schedule || {};
            const univStart = univSchedule.startDate || r.date || '2000-01-01';

            if (dateString < univStart) return;

            if (univSchedule.durationDays) {
                const start = new Date(univStart);
                const current = new Date(dateString);
                const diffInDays = Math.ceil((current - start) / (1000 * 60 * 60 * 24));
                if (diffInDays < 0) return;
                if (diffInDays >= univSchedule.durationDays) return;
            }
            if (univSchedule.endDate) {
                if (dateString > univSchedule.endDate) return;
            }

            // 1. Handle Complex Schedules (Medication)
            if (r.schedule && r.schedule.type === 'recurring') {
                const startStr = r.schedule.startDate; 
                if (dateString < startStr) return;

                const diffDays = getHealthDiffDays(startStr, dateString);

                if (diffDays >= 0 && (r.schedule.durationDays ? diffDays < r.schedule.durationDays : true)) {
                    const times = r.schedule.times || {};
                    Object.entries(times).forEach(([period, time]) => {
                        if (!r.schedule.frequency.includes(period)) return;

                        let instanceKey = \`\${dateString}_period_\${period}\`;
                        
                        // Check for EXCEPTION (Edit Instance)
                        const exception = (r.exceptions || {})[instanceKey];
                        if (exception && exception.status === 'cancelled') return;

                        let displayTime = exception?.time || time; 
                        let checkDateTime = new Date(dateString);
                        if (displayTime && displayTime.includes(':')) {
                            const [th, tm] = displayTime.split(':').map(Number);
                            checkDateTime.setHours(th, tm, 0, 0);
                        }

                        // Log Logic
                        const log = (r.logs || {})[instanceKey];
                        if (log && log.snoozedUntil && log.status === 'snoozed') {
                             if (log.snoozedUntil.includes('T')) {
                                checkDateTime = new Date(log.snoozedUntil);
                                displayTime = checkDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                            } else {
                                displayTime = log.snoozedUntil;
                                const [sth, stm] = displayTime.split(':').map(Number);
                                checkDateTime.setHours(sth, stm, 0, 0);
                            }
                        }

                        // STRICT STATUS LOGIC
                        let status = 'upcoming'; 
                        const now = new Date();
                        const twoHoursMs = 2 * 60 * 60 * 1000;
                        const diff = now.getTime() - checkDateTime.getTime();

                        if (log && log.status === 'taken') status = 'taken';
                        else if (log && log.status === 'missed') status = 'missed';
                        else if (log && log.status === 'snoozed') {
                             // SNOOZE FUTURE CHECK
                             const snoozedDate = new Date(checkDateTime);
                             snoozedDate.setHours(0, 0, 0, 0);
                             const targetDateObj = new Date(dateString);
                             targetDateObj.setHours(0, 0, 0, 0);

                             if (snoozedDate > targetDateObj) {
                                  return; // Hidden from today
                             }
                             if (diff < twoHoursMs) status = 'snoozed';
                             else status = 'missed';
                        }
                        else if (diff > twoHoursMs) status = 'missed';
                        else status = 'upcoming';

                        // Future safety
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dObj = new Date(dateString);
                        dObj.setHours(0, 0, 0, 0);
                        if (dObj > today && status === 'missed') status = 'upcoming';

                        expanded.push({
                            ...r,
                            ...exception, 
                            uniqueId: \`\${r.id}_\${instanceKey}\`,
                            instanceKey: instanceKey,
                            time: displayTime,
                            originalTime: time,
                            displayTime: displayTime,
                            period: period,
                            status: status,
                            takenAt: log ? log.takenAt : null,
                            isVirtual: true,
                            targetDate: dateString 
                        });
                    });
                }
            }
            // 2. Handle Simple/Legacy Reminders
            else {
                let times = [];

                if (r.frequency?.startsWith('Every')) {
                    // Hourly / Interval Logic
                    const match = r.frequency.match(/Every\\s+(\\d+)\\s*(h|hour|hours)?/i);
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

                        const [limitH, limitM] = r.endTime ? r.endTime.split(':').map(Number) : sleepStart.split(':').map(Number);
                        let currentMinutes = startH * 60 + startM;
                        let limitMinutes = limitH * 60 + limitM;

                        if (limitMinutes < currentMinutes) limitMinutes += 24 * 60;
                        if (limitMinutes - currentMinutes > 24 * 60) limitMinutes = currentMinutes + 24 * 60;

                        const step = intervalHours * 60;
                        if (step > 0) {
                            while (currentMinutes <= limitMinutes) {
                                let h = Math.floor(currentMinutes / 60);
                                const m = currentMinutes % 60;
                                if (h >= 24) h -= 24;
                                const timeStr = \`\${String(h).padStart(2, '0')}:\${String(m).padStart(2, '0')}\`;
                                times.push(timeStr);
                                currentMinutes += step;
                            }
                        }
                    }
                } else {
                    // STANDARD SINGLE / DAILY
                    if (r.id) {
                         // Check frequency
                         if (!r.frequency || r.frequency === 'Once') {
                             if (r.date === dateString) {
                                 times.push(r.time || '09:00');
                             }
                         } else {
                             // Daily/Weekly/etc
                             // Simplified check: assume 'Daily' for now if not 'Once' and not 'Every'
                             // Real app likely has day check. 
                             // Assuming daily for simple migration or existing logic:
                             times.push(r.time || '09:00');
                         }
                    }
                }

                // PROCESS NATURAL INSTANCES (Legacy Loop)
                times.forEach(time => {
                        // CRITICAL FIX V5.4: Key Format Standardization
                        let instanceKey = \`\${dateString}_\${time || 'default'}\`;
                        const [y, m, d] = dateString.split('-').map(Number);
                        const legacyDates = [
                            \`\${m}/\${d}/\${y}\`, \`\${d}/\${m}/\${y}\`,
                            \`\${m}/\${d}/\${String(y).slice(-2)}\`, \`\${d}/\${m}/\${String(y).slice(-2)}\`
                        ];

                        let checkKeys = [instanceKey, \`\${dateString}_time_\${time || 'default'}\`];
                        legacyDates.forEach(ld => {
                            checkKeys.push(\`\${ld}_\${time || 'default'}\`);
                            checkKeys.push(\`\${ld}_time_\${time || 'default'}\`);
                        });

                        let log, exception;
                        for (const k of checkKeys) {
                            if ((r.logs || {})[k]) { log = r.logs[k]; instanceKey = k; break; }
                            if ((r.exceptions || {})[k]) { exception = r.exceptions[k]; instanceKey = k; break; }
                        }

                        if (exception && exception.status === 'cancelled') return;
                        if (exception && exception.date && exception.date !== dateString) return;

                        let displayTime = exception?.time || time;
                        let checkDateTime = new Date(dateString);

                        if (displayTime) {
                            const [th, tm] = displayTime.split(':').map(Number);
                            checkDateTime.setHours(th, tm, 0, 0);
                        } else {
                            checkDateTime.setHours(23, 59, 0, 0);
                        }

                        if (log && log.snoozedUntil && log.status === 'snoozed') {
                             // SNOOZE CHECK
                            if (log.snoozedUntil.includes('T')) {
                                checkDateTime = new Date(log.snoozedUntil);
                                displayTime = checkDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                            } else {
                                displayTime = log.snoozedUntil;
                                const [sth, stm] = displayTime.split(':').map(Number);
                                checkDateTime.setHours(sth, stm, 0, 0);
                            }
                        }

                        let status = 'upcoming';
                        const now = new Date();
                        const twoHoursMs = 2 * 60 * 60 * 1000;
                        const diff = now.getTime() - checkDateTime.getTime();

                        if (log && log.status === 'taken') status = 'taken';
                        else if (log && log.status === 'missed') status = 'missed';
                        else if (r.status === 'done' && !log && r.frequency === 'Once') status = 'taken';
                        else if (log && log.status === 'snoozed') {
                             const snoozedDate = new Date(checkDateTime);
                             snoozedDate.setHours(0, 0, 0, 0);
                             const targetDateObj = new Date(dateString);
                             targetDateObj.setHours(0, 0, 0, 0);

                             if (snoozedDate > targetDateObj) {
                                  return; 
                             }
                             if (diff < twoHoursMs) status = 'snoozed';
                             else status = 'missed';
                        }
                        else if (diff > twoHoursMs) status = 'missed';
                        else status = 'upcoming';

                        // Future safety
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dObj = new Date(dateString);
                        dObj.setHours(0, 0, 0, 0);
                        if (dObj > today && status === 'missed') status = 'upcoming';

                        let takenAt = log ? log.takenAt : null;

                        expanded.push({
                            ...r,
                            ...exception,
                            files: (exception && exception.files && exception.files.length > 0) ? exception.files : (r.files || []),
                            uniqueId: \`\${r.id}_\${instanceKey}\`,
                            instanceKey: instanceKey,
                            displayTime: displayTime,
                            status: status,
                            takenAt: takenAt,
                            isVirtual: true,
                            isMovedIn: false,
                            targetDate: dateString
                        });
                });
            }

            // CRITICAL FIX Phase 3: Check for instances snoozed TO this date (from past dates)
            if (r.logs) {
                Object.entries(r.logs).forEach(([key, log]) => {
                    const originalDate = key.split('_')[0];
                    if (originalDate === dateString) return; 

                    if (log.status === 'snoozed' && log.snoozedUntil) {
                         let snoozedDateStr = '';
                         let displayTime = '';
                         if (log.snoozedUntil.includes('T')) {
                             const d = new Date(log.snoozedUntil);
                             snoozedDateStr = d.toLocaleDateString('en-CA');
                             displayTime = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                         } else {
                             return;
                         }

                         if (snoozedDateStr === dateString) {
                             const alreadyExists = expanded.some(item => item.instanceKey === key);
                             if (alreadyExists) return;

                              expanded.push({
                                ...r,
                                uniqueId: \`\${r.id}_\${key}\`,
                                instanceKey: key,
                                displayTime: displayTime,
                                status: 'snoozed',
                                takenAt: null,
                                isVirtual: true,
                                isMovedIn: true,
                                targetDate: dateString,
                                time: displayTime,
                                title: \`(Snoozed) \${r.title}\`
                            });
                         }
                    }
                });
            }

            // CRITICAL FIX Phase 2: Check for instances moved TO this date (from other dates)
            if (r.exceptions) {
                Object.entries(r.exceptions).forEach(([key, ex]) => {
                    if (ex.date === dateString) {
                        const alreadyExists = expanded.some(item => item.instanceKey === key);
                        if (alreadyExists) return;

                        const log = (r.logs || {})[key];
                        let displayTime = ex.time;
                        let checkDateTime = new Date(dateString);
                        if (displayTime) {
                            const [th, tm] = displayTime.split(':').map(Number);
                            checkDateTime.setHours(th, tm, 0, 0);
                        }

                        if (log && log.snoozedUntil && log.status === 'snoozed') {
                            if (log.snoozedUntil.includes('T')) {
                                checkDateTime = new Date(log.snoozedUntil);
                                displayTime = checkDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                            } else {
                                displayTime = log.snoozedUntil;
                                const [sth, stm] = displayTime.split(':').map(Number);
                                checkDateTime.setHours(sth, stm, 0, 0);
                            }
                        }

                        let status = 'upcoming';
                        const now = new Date();
                        const diff = now.getTime() - checkDateTime.getTime();
                        const twoHoursMs = 2 * 60 * 60 * 1000;

                        if (log && log.status === 'taken') status = 'taken';
                        else if (log && log.status === 'missed') status = 'missed';
                        else if (log && log.status === 'snoozed') status = 'snoozed';
                        else if (diff > twoHoursMs) status = 'missed';
                        else status = 'upcoming';

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dObj = new Date(dateString);
                        dObj.setHours(0, 0, 0, 0);
                        if (dObj > today && status === 'missed') status = 'upcoming';

                        let takenAt = log ? log.takenAt : null;

                        expanded.push({
                            ...r,
                            ...ex,
                            files: (ex.files && ex.files.length > 0) ? ex.files : (r.files || []),
                            uniqueId: \`\${r.id}_\${key}\`,
                            instanceKey: key,
                            displayTime: displayTime,
                            status: status,
                            takenAt: takenAt,
                            isVirtual: true,
                            isMovedIn: true,
                            targetDate: dateString
                        });
                    }
                });
            }
        });

        // Sort by time
        return expanded.sort((a, b) => {
            if (!a.displayTime) return 1;
            if (!b.displayTime) return -1;
            return a.displayTime.localeCompare(b.displayTime);
        });
    },`;

// Find STUB start and end
let startIdx = lines.findIndex(l => l.trim().startsWith('expandRemindersForDate:'));
let endIdx = lines.findIndex(l => l.trim().startsWith('getRemindersForDate:'));

if (startIdx !== -1 && endIdx !== -1) {
    // Replace the Stub with fullLogic
    // The Stub logic was 1 line logic + wrapper.
    // The fullLogic includes the wrapper line "expandRemindersForDate: ...".
    // So we replace from startIdx to endIdx - 1.

    // Check if endIdx is the line with getRemindersForDate.
    // Yes, we want to keep that line.

    // Note: ensure fullLogic ends with comma if needed?
    // "    }," is the end of fullLogic.

    lines.splice(startIdx, endIdx - startIdx, fullLogic);
    fs.writeFileSync(path, lines.join('\n'));
    console.log('Restored successfully!');
} else {
    console.error('Anchors not found!');
    process.exit(1);
}
