'use strict';

/**
 * Every LLM call Sage needs, isolated behind one module. Each function below is
 * a deterministic mock (keyword/regex based, no network, no API key) so the
 * engine and eval harness run offline and reproducibly. When a Gemini/Claude
 * key is available, replace the body of these three functions with real API
 * calls — call sites in sageEngine.js do not need to change.
 */

const MOOD_KEYWORDS = {
  tired: 'peaceful', exhausted: 'peaceful', burned: 'peaceful', burnout: 'peaceful',
  unplug: 'peaceful', disconnect: 'peaceful', relax: 'peaceful', peaceful: 'peaceful',
  adventure: 'adventurous', adventurous: 'adventurous', excitement: 'adventurous', thrill: 'adventurous',
  romantic: 'romantic', romance: 'romantic', honeymoon: 'romantic',
  surprise: 'open', 'open to': 'open', anywhere: 'open'
};

const GROUP_KEYWORDS = {
  solo: 'solo', alone: 'solo', myself: 'solo',
  couple: 'couple', partner: 'couple', wife: 'couple', husband: 'couple', girlfriend: 'couple', boyfriend: 'couple',
  family: 'family', kids: 'family', children: 'family', parents: 'family',
  friends: 'friends', group: 'friends', gang: 'friends'
};

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function extractBudget(text) {
  const perDay = text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s?k?\s*(?:per day|\/day|a day)/i);
  const total = text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s?k?\s*(?:total|for the trip)/i);

  const parseAmount = (raw) => {
    const isK = /k\b/i.test(raw);
    let n = parseFloat(raw.replace(/,/g, '').replace(/k\b/i, ''));
    if (isK) n *= 1000;
    return Math.round(n);
  };

  if (perDay) return parseAmount(perDay[0]);
  if (total) return Math.round(parseAmount(total[0]) / 4); // rough per-day normalisation for a 4-day trip
  return null;
}

function extractMonth(text) {
  const lower = text.toLowerCase();
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (new RegExp(`\\b${MONTH_NAMES[i]}\\b`).test(lower)) return i + 1;
  }
  return null;
}

function extractNegativeTags(text) {
  const tags = [];
  const negPattern = /\b(?:no|not|avoid|never|hate|dislike)\s+([a-z-]{3,20})/gi;
  let match;
  while ((match = negPattern.exec(text)) !== null) {
    tags.push(match[1].trim().toLowerCase());
  }
  return [...new Set(tags)];
}

function extractIntent(latestUtterance, accumulatedContext = {}) {
  const text = latestUtterance.toLowerCase();
  const context = { ...accumulatedContext };

  for (const [kw, mood] of Object.entries(MOOD_KEYWORDS)) {
    if (text.includes(kw)) { context.mood = mood; break; }
  }
  for (const [kw, group] of Object.entries(GROUP_KEYWORDS)) {
    if (text.includes(kw)) { context.group_type = group; break; }
  }

  const budget = extractBudget(text);
  if (budget) context.budget_daily_max = budget;

  const month = extractMonth(text);
  if (month) context.travel_month = month;

  const negTags = extractNegativeTags(text);
  if (negTags.length) {
    context.negative_tags = [...new Set([...(context.negative_tags || []), ...negTags])];
  }

  return context;
}

function generateSpokenResponse(context, destinations) {
  const names = destinations.map(d => d.name).join(', ');
  const opener = context.mood === 'open'
    ? "Since you're up for anything, here are a few you might not expect"
    : context.mood
      ? `Given you're feeling ${context.mood}`
      : 'Based on what you shared';
  return `${opener}, I think you'd love ${names}.`;
}

function generateReason(destination, context) {
  const reasons = [];
  if (context.mood && context.mood !== 'open') reasons.push(`you mentioned wanting something ${context.mood}`);
  if (context.negative_tags && context.negative_tags.length) {
    reasons.push(`you ruled out ${context.negative_tags.join(', ')}, and this steers clear of that`);
  }
  if (context.budget_daily_max) reasons.push(`it fits your ~₹${context.budget_daily_max}/day budget`);
  if (context.travel_month) reasons.push(`your travel month lines up well with its best season`);
  if (!reasons.length) reasons.push(`its ${destination.vibe.slice(0, 2).join(' and ')} vibe matches what you're exploring`);
  return `${destination.name} fits because ${reasons.join(', and ')}.`;
}

module.exports = { extractIntent, generateSpokenResponse, generateReason };
