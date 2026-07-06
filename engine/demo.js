'use strict';

// Run with: node engine/demo.js
const sage = require('./sageEngine');

const utterance = "I'm exhausted and want to unplug for a week, budget around 4000 per day, thinking September, no beaches please";

console.log('--- Strategy: ranking ---');
console.log(JSON.stringify(sage.respond({ utterance, strategy: 'ranking' }), null, 2));

console.log('\n--- Strategy: reranking ---');
console.log(JSON.stringify(sage.respond({ utterance, strategy: 'reranking' }), null, 2));
