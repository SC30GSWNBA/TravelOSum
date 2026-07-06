'use strict';

/**
 * Shape for real user feedback events (👍/👎/save/never-show/tell-me-more),
 * the production-side counterpart to the offline golden-set evals in this
 * folder. The UI writes one of these per user action; `strategy_used` is what
 * lets a later report answer "did re-ranking get a better reception than
 * ranking from real users" using the same event stream.
 */

const SIGNAL_TYPES = ['thumbs_up', 'thumbs_down', 'save', 'never_show', 'tell_me_more', 'dwell_time'];

function createFeedbackEvent({ sessionId, turnId, destinationId, signalType, value = null, reason = null, strategyUsed }) {
  if (!SIGNAL_TYPES.includes(signalType)) {
    throw new Error(`Unknown signal type: ${signalType}`);
  }
  return {
    session_id: sessionId,
    turn_id: turnId,
    destination_id: destinationId,
    signal_type: signalType,
    value,
    reason,
    strategy_used: strategyUsed,
    timestamp: new Date().toISOString()
  };
}

function aggregateByStrategy(events) {
  const byStrategy = {};
  events.forEach(e => {
    const key = e.strategy_used || 'unknown';
    byStrategy[key] = byStrategy[key] || { thumbs_up: 0, thumbs_down: 0, save: 0, never_show: 0, tell_me_more: 0, total: 0 };
    byStrategy[key].total += 1;
    if (byStrategy[key][e.signal_type] != null) byStrategy[key][e.signal_type] += 1;
  });
  Object.values(byStrategy).forEach(s => {
    s.positive_rate = s.total ? Number(((s.thumbs_up + s.save) / s.total).toFixed(2)) : 0;
    s.negative_rate = s.total ? Number(((s.thumbs_down + s.never_show) / s.total).toFixed(2)) : 0;
  });
  return byStrategy;
}

module.exports = { SIGNAL_TYPES, createFeedbackEvent, aggregateByStrategy };
