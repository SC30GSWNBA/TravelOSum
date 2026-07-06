'use strict';

/**
 * Orchestrator: conversation turn in, structured Sage response out (schema
 * matches PRD §7.3). The `strategy` param ('ranking' | 'reranking') is the
 * only thing that changes which methodology produced the 3 destinations —
 * everything else (filtering, explanation, response shape) is identical,
 * which is what makes the swap a one-line config change rather than a rewrite.
 */

const destinationStore = require('./destinationStore');
const constraints = require('./constraints');
const ranking = require('./ranking');
const reranking = require('./reranking');
const llmClient = require('./llmClient');

const INSPIRATION_TRIGGERS = ['surprise', 'anything', 'open to', "don't know", 'no idea', 'you pick'];

function detectMode(utterance, context) {
  const lower = utterance.toLowerCase();
  const hasSpecificConstraint = !!(context.budget_daily_max || context.travel_month);
  const saysOpen = INSPIRATION_TRIGGERS.some(t => lower.includes(t));
  if (saysOpen && !hasSpecificConstraint) return 'inspiration';
  return hasSpecificConstraint ? 'planning' : (saysOpen ? 'inspiration' : 'planning');
}

function respond({ utterance, previousContext = {}, sessionProfile = null, strategy = 'ranking' }) {
  const start = Date.now();

  const context = llmClient.extractIntent(utterance, previousContext);
  const mode = detectMode(utterance, context);
  if (mode === 'inspiration' && !context.mood) context.mood = 'open';

  const all = destinationStore.loadAll();
  let candidates = constraints.applyHardFilters(all, context);
  let relaxationApplied = null;

  if (candidates.length < 3) {
    candidates = constraints.relaxFilters(all, context, 1);
    relaxationApplied = 'season';
  }
  if (candidates.length < 3) {
    candidates = constraints.relaxFilters(all, context, 2);
    relaxationApplied = 'budget-and-season';
  }

  const strategyFn = strategy === 'reranking' ? reranking.rerank : ranking.rank;
  const picks = strategyFn(candidates, context, sessionProfile);

  const destinations = picks.map((p, idx) => ({
    id: p.destination.id,
    rank: idx + 1,
    match_score: Number(p.matchScore.toFixed(2)),
    personalized_reason: llmClient.generateReason(p.destination, context),
    seasonal_flag: constraints.seasonalFlag(p.destination, context),
    budget_flag: constraints.budgetFlag(p.destination, context)
  }));

  return {
    spoken_response: llmClient.generateSpokenResponse(context, picks.map(p => p.destination)),
    destinations,
    follow_up_question: mode === 'planning' && !context.travel_month
      ? 'Roughly which month are you thinking of traveling?'
      : null,
    detected_mode: mode,
    extracted_context: context,
    _meta: {
      strategy,
      relaxation_applied: relaxationApplied,
      candidate_pool_size: candidates.length,
      latency_ms: Date.now() - start
    }
  };
}

module.exports = { respond };
