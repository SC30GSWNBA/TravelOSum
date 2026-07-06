'use strict';

// Run with: node evals/runEval.js
// Writes evals/eval-report.json (machine-readable) and evals/eval-report.md
// (paste straight into a stakeholder doc/slide).

const fs = require('fs');
const path = require('path');
const sage = require('../engine/sageEngine');
const metrics = require('./metrics');

const goldenSet = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden-conversations.json'), 'utf-8'));
const strategies = ['ranking', 'reranking'];

function avg(nums) {
  if (!nums.length) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3));
}

function runOne(conversation, strategy) {
  const response = sage.respond({ utterance: conversation.utterance, strategy });
  return {
    id: conversation.id,
    strategy,
    result_count_ok: metrics.resultCount(response),
    diversity_ok: metrics.diversityCheck(response),
    constraint_violations: metrics.constraintViolations(response, conversation.expected),
    explanation_groundedness: metrics.explanationGroundedness(response),
    avg_hidden_gem_score: metrics.avgHiddenGemScore(response),
    detected_mode: response.detected_mode,
    latency_ms: response._meta.latency_ms,
    picks: response.destinations.map(d => d.id)
  };
}

function summarize(rows) {
  const byStrategy = {};
  strategies.forEach(s => {
    const rowsForStrategy = rows.filter(r => r.strategy === s);
    byStrategy[s] = {
      total_cases: rowsForStrategy.length,
      result_count_pass_rate: avg(rowsForStrategy.map(r => (r.result_count_ok ? 1 : 0))),
      diversity_pass_rate: avg(rowsForStrategy.map(r => (r.diversity_ok ? 1 : 0))),
      constraint_violation_count: rowsForStrategy.reduce((sum, r) => sum + r.constraint_violations.length, 0),
      avg_explanation_groundedness: avg(rowsForStrategy.map(r => r.explanation_groundedness)),
      avg_hidden_gem_score: avg(rowsForStrategy.map(r => r.avg_hidden_gem_score)),
      avg_latency_ms: avg(rowsForStrategy.map(r => r.latency_ms))
    };
  });
  return byStrategy;
}

function toMarkdownTable(summary) {
  const keys = Object.keys(summary.ranking);
  let md = '| Metric | Ranking | Re-ranking |\n|---|---|---|\n';
  keys.forEach(k => { md += `| ${k} | ${summary.ranking[k]} | ${summary.reranking[k]} |\n`; });
  return md;
}

const rows = [];
goldenSet.forEach(conversation => {
  strategies.forEach(strategy => rows.push(runOne(conversation, strategy)));
});

const summary = summarize(rows);
const violations = rows.filter(r => r.constraint_violations.length > 0);

const report = { generated_at: new Date().toISOString(), golden_set_size: goldenSet.length, summary, rows };
fs.writeFileSync(path.join(__dirname, 'eval-report.json'), JSON.stringify(report, null, 2));

const markdown = [
  '# TravelOSum Eval Report',
  `Generated: ${report.generated_at}`,
  `Golden set size: ${goldenSet.length} conversations x ${strategies.length} strategies = ${rows.length} runs`,
  '',
  '## Ranking vs Re-ranking — Golden Set Comparison',
  '',
  toMarkdownTable(summary),
  '## Constraint Violations',
  '',
  violations.length
    ? violations.map(r => `- [${r.strategy}] ${r.id}: ${r.constraint_violations.join('; ')}`).join('\n')
    : 'None found across either strategy.',
  ''
].join('\n');

fs.writeFileSync(path.join(__dirname, 'eval-report.md'), markdown);

console.log('=== TravelOSum Eval Report: Ranking vs Re-ranking ===\n');
strategies.forEach(s => {
  console.log(`Strategy: ${s}`);
  console.table(summary[s]);
});

if (violations.length) {
  console.log('\nConstraint violations found:');
  violations.forEach(r => console.log(`  [${r.strategy}] ${r.id}:`, r.constraint_violations));
} else {
  console.log('\nNo hard-constraint violations across the golden set.');
}

console.log('\nWritten: evals/eval-report.json (raw) and evals/eval-report.md (stakeholder-ready)');
