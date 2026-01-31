// Test to see if toLocaleDateString is causing issues

const today = new Date();
console.log('Today:', today);
console.log('toLocaleDateString en-CA:', today.toLocaleDateString('en-CA'));

// Check what happens when we parse dates
for (let i = 0; i < 3; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = date.toLocaleDateString('en-CA');
    console.log(`Day ${i}:`, dateStr);

    // Parse it back
    const [year, month, day] = dateStr.split('-').map(Number);
    const parsed = new Date(year, month - 1, day, 18, 54, 0, 0);
    console.log('  Parsed back:', parsed);
    console.log('  ISO:', parsed.toISOString());
}
