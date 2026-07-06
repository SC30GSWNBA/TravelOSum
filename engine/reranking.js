'use strict';

/**
 * "Re-ranking" strategy: retrieve a wider candidate pool cheaply (stage 1,
 * same scoring as ranking.js), then jointly re-optimise the final 3 over that
 * pool (stage 2) instead of scoring each item independently. Diversity and
 * novelty are evaluated against what's *already been picked*, recalculated at
 * each selection step — the actual methodological difference from ranking.js,
 * where diversity is a one-shot post-filter over independently-scored items.
 *
 * rerankPool() is the seam where a real cross-encoder / LLM re-ranker call
 * would replace the heuristic joint-scoring below.
 */

const { scoreCandidate } = require('./ranking');

const RETRIEVAL_POOL_SIZE = 10;

function retrieveCandidatePool(candidates, context, sessionProfile) {
  const scored = candidates.map(d => scoreCandidate(d, context, sessionProfile));
  return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, RETRIEVAL_POOL_SIZE);
}

function rerankPool(pool, context) {
  const chosen = [];
  const usedTypes = new Set();
  const remaining = [...pool];

  while (chosen.length < 3 && remaining.length > 0) {
    let bestIdx = 0;
    let bestValue = -Infinity;

    remaining.forEach((candidate, idx) => {
      const primaryType = candidate.destination.type[0];
      const diversityPenalty = usedTypes.has(primaryType) ? 0.35 : 0;
      const noveltyBonus = context.mood === 'open' ? (candidate.destination.hidden_gem_score / 10) * 0.25 : 0;
      const jointValue = candidate.matchScore - diversityPenalty + noveltyBonus;
      if (jointValue > bestValue) {
        bestValue = jointValue;
        bestIdx = idx;
      }
    });

    const [selected] = remaining.splice(bestIdx, 1);
    chosen.push({ ...selected, matchScore: Number(bestValue.toFixed(3)) });
    usedTypes.add(selected.destination.type[0]);
  }

  return chosen;
}

function rerank(candidates, context, sessionProfile) {
  const pool = retrieveCandidatePool(candidates, context, sessionProfile);
  return rerankPool(pool, context);
}

module.exports = { rerank, retrieveCandidatePool, rerankPool, RETRIEVAL_POOL_SIZE };
