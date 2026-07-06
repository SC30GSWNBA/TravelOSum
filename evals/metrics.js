'use strict';

const destinationStore = require('../engine/destinationStore');

function constraintViolations(response, expected) {
  const violations = [];
  response.destinations.forEach(d => {
    const full = destinationStore.getById(d.id);
    if (!full) {
      violations.push(`Unknown destination id returned: ${d.id}`);
      return;
    }
    if (expected.travel_month && full.avoid_months.includes(expected.travel_month) && !d.seasonal_flag) {
      violations.push(`${d.id} is in an avoid_month (${expected.travel_month}) with no seasonal_flag`);
    }
    (expected.must_not_include_type || []).forEach(type => {
      if (full.type.includes(type)) violations.push(`${d.id} has excluded type "${type}"`);
    });
  });
  return violations;
}

function diversityCheck(response) {
  const primaryTypes = response.destinations.map(d => {
    const full = destinationStore.getById(d.id);
    return full ? full.type[0] : null;
  });
  return new Set(primaryTypes).size === primaryTypes.length;
}

function explanationGroundedness(response) {
  if (!response.destinations.length) return 0;
  let grounded = 0;
  const ctx = response.extracted_context || {};
  const terms = [ctx.mood, ...(ctx.negative_tags || [])].filter(Boolean).map(t => String(t).toLowerCase());

  response.destinations.forEach(d => {
    const reason = (d.personalized_reason || '').toLowerCase();
    const hasGrounding = terms.some(t => reason.includes(t)) || reason.includes('budget') || reason.includes('vibe') || reason.includes('season');
    if (hasGrounding) grounded += 1;
  });
  return Number((grounded / response.destinations.length).toFixed(2));
}

function resultCount(response) {
  return response.destinations.length === 3;
}

function avgHiddenGemScore(response) {
  const scores = response.destinations
    .map(d => destinationStore.getById(d.id))
    .filter(Boolean)
    .map(d => d.hidden_gem_score);
  return scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
}

module.exports = { constraintViolations, diversityCheck, explanationGroundedness, resultCount, avgHiddenGemScore };
