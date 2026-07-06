'use strict';

/**
 * "Ranking" strategy: score every candidate independently on the PRD's
 * 40/30/20/10 formula (semantic / constraint / preference / hidden-gem),
 * sort, then cut the top 3 while enforcing the diversity rule as a
 * post-filter. This is the default/baseline methodology.
 */

function tagOverlapScore(destination, context) {
  const destTags = new Set([...destination.type, ...destination.vibe, ...destination.tags_for_matching].map(t => t.toLowerCase()));
  let score = 0;
  if (context.mood && context.mood !== 'open' && destTags.has(context.mood)) score += 0.6;
  if (context.group_type && destination.group_suitability.includes(context.group_type)) score += 0.4;
  return Math.min(score, 1);
}

function constraintScore(destination, context) {
  if (!context.travel_month) return 0.7; // neutral when no season stated
  if (destination.best_months.includes(context.travel_month)) return 1;
  if (destination.avoid_months.includes(context.travel_month)) return 0.2;
  return 0.6;
}

function preferenceScore(destination, sessionProfile) {
  if (!sessionProfile) return 0.5;
  const likedTags = sessionProfile.liked_tags || {};
  const dislikedTags = sessionProfile.disliked_tags || {};
  let score = 0.5;
  [...destination.type, ...destination.vibe].forEach(t => {
    if (likedTags[t]) score += 0.15 * likedTags[t];
    if (dislikedTags[t]) score -= 0.2 * dislikedTags[t];
  });
  return Math.max(0, Math.min(1, score));
}

function scoreCandidate(destination, context, sessionProfile) {
  const semantic = tagOverlapScore(destination, context);
  const constraint = constraintScore(destination, context);
  const preference = preferenceScore(destination, sessionProfile);
  const hiddenGemBonus = context.mood === 'open' ? destination.hidden_gem_score / 10 : 0.3;
  const matchScore = semantic * 0.4 + constraint * 0.3 + preference * 0.2 + hiddenGemBonus * 0.1;
  return { destination, matchScore, semantic, constraint, preference };
}

function pickDiverseTop3(scored) {
  const sorted = [...scored].sort((a, b) => b.matchScore - a.matchScore);
  const picked = [];
  const usedTypes = new Set();

  for (const candidate of sorted) {
    const primaryType = candidate.destination.type[0];
    if (!usedTypes.has(primaryType)) {
      picked.push(candidate);
      usedTypes.add(primaryType);
    }
    if (picked.length === 3) break;
  }

  if (picked.length < 3) {
    for (const candidate of sorted) {
      if (picked.length === 3) break;
      if (!picked.includes(candidate)) picked.push(candidate);
    }
  }

  return picked;
}

function rank(candidates, context, sessionProfile) {
  const scored = candidates.map(d => scoreCandidate(d, context, sessionProfile));
  return pickDiverseTop3(scored);
}

module.exports = { rank, scoreCandidate, pickDiverseTop3 };
