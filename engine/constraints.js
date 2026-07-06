'use strict';

const TIER_ORDER = { budget: 0, mid: 1, premium: 2 };

function tierFromDailyBudget(dailyMax) {
  if (dailyMax == null) return null;
  if (dailyMax < 3000) return 'budget';
  if (dailyMax <= 8000) return 'mid';
  return 'premium';
}

function budgetGap(destinationTier, userTier) {
  if (!userTier) return 0;
  return TIER_ORDER[destinationTier] - TIER_ORDER[userTier];
}

function seasonStatus(destination, travelMonth) {
  if (!travelMonth) return 'unknown';
  if (destination.avoid_months.includes(travelMonth)) return 'avoid';
  if (destination.best_months.includes(travelMonth)) return 'best';
  return 'ok';
}

function matchesNegativeTag(destination, negTag) {
  const singular = negTag.endsWith('s') ? negTag.slice(0, -1) : negTag;
  const dTags = new Set([...destination.type, ...destination.vibe, ...destination.tags_for_matching].map(t => t.toLowerCase()));
  return dTags.has(negTag) || dTags.has(singular);
}

function applyHardFilters(destinations, context, options = {}) {
  const { ignoreSeason = false, ignoreBudget = false } = options;
  const userTier = tierFromDailyBudget(context.budget_daily_max);
  const negativeTags = context.negative_tags || [];

  return destinations.filter(d => {
    if (!ignoreBudget && userTier) {
      if (budgetGap(d.budget.tier, userTier) >= 2) return false; // 2+ tiers above stated budget: hard exclude
    }
    if (!ignoreSeason && context.travel_month && seasonStatus(d, context.travel_month) === 'avoid') {
      return false;
    }
    for (const neg of negativeTags) {
      if (matchesNegativeTag(d, neg)) return false;
    }
    return true;
  });
}

// level 1: relax the season hard-filter (still shown with a flag); level 2: relax budget too
function relaxFilters(destinations, context, level) {
  if (level === 1) return applyHardFilters(destinations, context, { ignoreSeason: true });
  return applyHardFilters(destinations, context, { ignoreSeason: true, ignoreBudget: true });
}

function budgetFlag(destination, context) {
  const userTier = tierFromDailyBudget(context.budget_daily_max);
  if (!userTier) return null;
  return budgetGap(destination.budget.tier, userTier) === 1 ? 'Slightly above your stated range, worth a look' : null;
}

function seasonalFlag(destination, context) {
  if (!context.travel_month) return null;
  return seasonStatus(destination, context.travel_month) === 'avoid'
    ? 'Off-season for your travel month — shown because too few in-season matches were left'
    : null;
}

module.exports = { applyHardFilters, relaxFilters, budgetFlag, seasonalFlag, tierFromDailyBudget, seasonStatus };
