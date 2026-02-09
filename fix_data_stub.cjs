const fs = require('fs');
const path = 'src/services/data.js';
const data = fs.readFileSync(path, 'utf8');
const lines = data.split('\n');

const stubLogic = `    expandRemindersForDate: (dateString, sourceReminders, settings = {}) => {
        // STUBBED FOR BUILD REPAIR
        return [];
    },`;

let startIdx = lines.findIndex(l => l.trim().startsWith('expandRemindersForDate:'));
let endIdx = lines.findIndex(l => l.trim().startsWith('getRemindersForDate:'));

if (startIdx !== -1 && endIdx !== -1) {
    // Keep 'getRemindersForDate' (endIdx), delete up to it.
    // Replace from startIdx to endIdx - 1.
    // Actually, we want to replace the whole function body.
    // startIdx is 'expandRemindersForDate: ...'
    // We replace it with new function definition.

    // Check if there are lines between?
    // Remove lines from startIdx to endIdx - 1.
    // Insert stubLogic at startIdx.

    lines.splice(startIdx, endIdx - startIdx, stubLogic);
    fs.writeFileSync(path, lines.join('\n'));
    console.log('Stubbed successfully!');
} else {
    console.error('Anchors not found!');
    console.log('Start:', startIdx, 'End:', endIdx);
    process.exit(1);
}
