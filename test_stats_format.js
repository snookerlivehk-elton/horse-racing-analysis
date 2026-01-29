
function formatJcStats(raw) {
    if (!raw) return '-';
    // Remove all whitespace
    const clean = raw.replace(/\s+/g, '');
    
    // Try to match 5 numbers first: N-N-N-N-N
    const match5 = clean.match(/(\d+)-(\d+)-(\d+)-(\d+)-(\d+)/);
    if (match5) {
        const nums = match5.slice(1, 6).map(n => parseInt(n, 10));
        const total = nums.reduce((a, b) => a + b, 0);
        return `${total}(${nums.join('-')})`;
    }

    // Try to match 4 numbers: N-N-N-N
    const match4 = clean.match(/(\d+)-(\d+)-(\d+)-(\d+)/);
    if (match4) {
        const nums = match4.slice(1, 5).map(n => parseInt(n, 10));
        const total = nums.reduce((a, b) => a + b, 0);
        return `${total}(${nums.join('-')})`;
    }
    
    return raw;
}

const testCases = [
    "12(2-3-1-0-6)",
    "2-3-1-0-6",
    "0-0-0-0-0",
    "(1-0-0-0-0)",
    " : 0-0-0-0-0 ",
    "1(1-0-0-0)",
    "2-3-1-0"
];

testCases.forEach(c => {
    console.log(`"${c}" -> "${formatJcStats(c)}"`);
});
