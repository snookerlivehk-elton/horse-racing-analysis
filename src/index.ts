import { calculateTotalScore, exampleHorse } from './scoring';

console.log(`Analyzing Horse: ${exampleHorse.name} (${exampleHorse.code})`);
console.log('--------------------------------------------------');

const result = calculateTotalScore(exampleHorse);

console.log('Category Scores (Raw / Weighted):');
console.log(`Career (15%):     ${result.breakdown.career.raw}  /  ${result.breakdown.career.weighted.toFixed(2)}`);
console.log(`Season (35%):     ${result.breakdown.season.raw}   /  ${result.breakdown.season.weighted.toFixed(2)}`);
console.log(`Track/Dist (20%): ${result.breakdown.track.raw}  /  ${result.breakdown.track.weighted.toFixed(2)}`);
console.log(`Jockey (30%):     ${result.breakdown.jockey.raw}   /  ${result.breakdown.jockey.weighted.toFixed(2)}`);
console.log('--------------------------------------------------');
console.log(`FINAL SYSTEM SCORE: ${result.total}`);
