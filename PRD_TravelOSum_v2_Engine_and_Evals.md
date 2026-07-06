# Product Requirements Document
# TravelOSum — Recommendation Engine & AI Evaluation Framework
## v2 — Engine Implementation + Evals

---

| | |
|---|---|
| **Product** | TravelOSum — AI Voice Destination Discovery Engine |
| **Version** | v2.0 — Engine + Evals, built on the 50-destination dataset |
| **Author** | AI Product Manager, TravelOSum |
| **Status** | Final — engine and evals are implemented and verified, not just specced |
| **Supersedes** | The engine-architecture and evals-adjacent sections of `PRD_TravelOSum_Portfolio.md` |
| **Companion files** | `destinations.json`, `engine/`, `evals/` (all in this repo) |
| **Last Updated** | July 2026 |

> **Read this if you are the PM shepherding this into a build, or presenting progress to stakeholders.** Every claim in this document is backed by code that runs today, with no API key and no dependencies — you can reproduce every number in §5 yourself with one command. Sections are written so you can lift language directly into a stakeholder update without needing an engineer to translate first.

---

## Table of Contents

1. [What Changed Since the Portfolio PRD](#1-what-changed-since-the-portfolio-prd)
2. [Dataset Snapshot (50 Destinations)](#2-dataset-snapshot-50-destinations)
3. [Recommendation Engine Architecture](#3-recommendation-engine-architecture)
4. [Ranking vs. Re-ranking — The Methodology Swap](#4-ranking-vs-re-ranking--the-methodology-swap)
5. [AI Evaluation Framework](#5-ai-evaluation-framework)
6. [Feedback Capture (Production Signal)](#6-feedback-capture-production-signal)
7. [Decision Framework: When to Switch Strategies](#7-decision-framework-when-to-switch-strategies)
8. [How to Present This to Stakeholders](#8-how-to-present-this-to-stakeholders)
9. [Repo Manifest](#9-repo-manifest)
10. [What's Deliberately Not Built Yet](#10-whats-deliberately-not-built-yet)

---

## 1. What Changed Since the Portfolio PRD

The portfolio PRD (`PRD_TravelOSum_Portfolio.md`) scoped the dataset down to 25 destinations to de-risk curation time. That risk didn't materialize — the full 50-destination set (`destinations.json`) got curated and validated, so **this document treats 50 as the working dataset**, not 25. Nothing else about the portfolio PRD's scope decisions (single-session focus, serverless proxy, simulated cross-session learning) changes here.

What's new in this document, and new in the repo:

- The recommendation engine described only in prose before (`engine/`) is now real, runnable code — no Gemini API key required to see it work, because the LLM calls are isolated behind one module (§3.2) that you swap out later.
- **Ranking and re-ranking are both implemented as interchangeable strategies today**, not a future roadmap item — this directly answers the ask to "use re-ranking instead of ranking if needed in future" by making that a one-parameter change rather than a rewrite.
- A full **AI evaluation framework** (`evals/`) that runs both strategies against a fixed test set and produces a report you can hand to stakeholders, plus the schema for capturing real user feedback once this is live.

---

## 2. Dataset Snapshot (50 Destinations)

Verified by running the dataset through a validation script (`python3 -c "import json..."` against `destinations.json`) — every entry conforms to the schema, all 50 IDs are unique, and no destination uses a `type` tag outside the allowed set.

| Dimension | Distribution |
|---|---|
| **Region** | North India: 12 · South India: 10 · West India: 8 · East India: 6 · Central India: 5 · Northeast India: 7 · Islands: 2 |
| **Budget tier** | Mid: 24 · Budget: 19 · Premium: 7 |
| **Type tags** (top) | Offbeat: 36 · Hill-station: 14 · Spiritual: 11 · Heritage: 11 · Beach: 10 · Mountain: 9 · Wildlife: 6 · City: 6 |
| **Hidden-gem spread** | Ranges from 1 (North Goa — maximally famous) to 9 (Chettinad, Gopalpur-on-Sea, Ziro Valley, Majuli, Tawang, Lakshadweep — genuinely offbeat) |

This spread matters for evals, not just curation completeness: a dataset skewed toward one region, tier, or type would make the ranking/diversity logic look better or worse than it actually is. The deliberate spread is what makes §5's metrics trustworthy rather than a lucky draw.

---

## 3. Recommendation Engine Architecture

### 3.1 Component map

```
engine/
  destinationStore.js   loads and caches destinations.json
  constraints.js         hard filters (budget tier gap, avoid_months) + soft flags
  llmClient.js           the ONLY file that talks to "the AI" — currently a
                         deterministic mock; swap this file's internals for a
                         real Gemini/Claude call and nothing else changes
  ranking.js             Strategy A — score independently, cut top 3
  reranking.js           Strategy B — retrieve wide, jointly re-optimise top 3
  sageEngine.js           orchestrator: conversation turn in, structured
                         response out (schema matches the PRD's response spec)
  demo.js                runnable example — `node engine/demo.js`
```

### 3.2 Why the LLM calls are isolated in one file

`llmClient.js` currently does **not** call Gemini or Claude — it uses keyword/regex heuristics to extract intent (mood, budget, month, group, negative preferences) and to generate the spoken response and per-card reasons. This is deliberate, not a shortcut you'll need to unwind later:

- The whole engine and eval suite run **today, offline, with zero API cost and zero API key**, which is what let this PRD ship with real numbers instead of projected ones.
- Every other file (`ranking.js`, `constraints.js`, `sageEngine.js`) calls `llmClient.extractIntent()` / `.generateReason()` / `.generateSpokenResponse()` — never a raw API call. When a Gemini key is available, only `llmClient.js`'s three function bodies change; nothing downstream needs to know.
- This is the single seam a PM should point to when an engineer asks "how much rework is 'plug in the real model'?" — the honest answer is: rewrite three functions in one file.

### 3.3 What the engine does, end to end

Given a user utterance (`node engine/demo.js` runs this against a real example):

1. `llmClient.extractIntent()` pulls mood, budget/day, travel month, group type, and negative preferences out of the text, merging with whatever was already known this session.
2. `sageEngine.detectMode()` decides **inspiration vs. planning** (PRD FR-09) from the same signals.
3. `constraints.applyHardFilters()` removes anything 2+ budget tiers out of range, in an avoid-month, or matching a stated negative preference — with a two-step relaxation ladder if fewer than 3 candidates survive (season relaxed first, budget only as a last resort), matching the PRD's "always return 3" acceptance criterion.
4. The chosen **strategy** (`ranking.js` or `reranking.js` — see §4) picks the final 3 and a per-item match score.
5. `llmClient.generateReason()` and `.generateSpokenResponse()` produce the explanation text.
6. `sageEngine.respond()` returns one JSON object matching the response schema, plus a `_meta` block (`strategy`, `latency_ms`, `candidate_pool_size`, whether a constraint was relaxed) that the eval harness reads.

Verified output (abridged) for *"I'm exhausted and want to unplug for a week, budget around 4000 per day, thinking September, no beaches please"*:

```json
{
  "spoken_response": "Given you're feeling peaceful, I think you'd love Spiti Valley, Rishikesh, Munnar.",
  "destinations": [
    { "id": "spiti-valley", "rank": 1, "match_score": 0.67, "seasonal_flag": null, "budget_flag": null },
    { "id": "rishikesh", "rank": 2, "match_score": 0.67, "seasonal_flag": null, "budget_flag": null },
    { "id": "munnar", "rank": 3, "match_score": 0.67, "seasonal_flag": null, "budget_flag": null }
  ],
  "detected_mode": "planning",
  "extracted_context": { "mood": "peaceful", "budget_daily_max": 4000, "travel_month": 9, "negative_tags": ["beaches"] }
}
```

No beach-type destination anywhere in the output, despite beaches being ~20% of the catalogue — the negative-preference filter is doing its job.

---

## 4. Ranking vs. Re-ranking — The Methodology Swap

This is the part of the ask worth being precise about, since "ranking" and "re-ranking" get used loosely. Here's the actual distinction as implemented:

| | **Ranking** (`ranking.js`, default) | **Re-ranking** (`reranking.js`) |
|---|---|---|
| **Step 1** | Score every candidate independently (semantic 40% / season fit 30% / session preference 20% / hidden-gem 10%) | Same independent scoring, but cast a **wider net** — keep the top 10, not just the top 3 |
| **Step 2** | Sort by score, then walk down the list picking the first 3 that satisfy the diversity rule (no 2 share a primary type) — diversity is a **post-hoc filter** over independently-scored items | Greedily select 3 from the pool of 10 by **jointly re-evaluating** each remaining candidate's value against what's *already been picked* — diversity and novelty are penalties/bonuses computed **relative to the emerging set**, recalculated at every pick |
| **Where it plugs into a real LLM later** | The score itself would come from an LLM call per-destination | The step-2 joint re-evaluation is where a cross-encoder or an LLM shown all 10 candidates *at once* would replace the heuristic — this is what people usually mean by "an LLM re-ranker" |
| **Cost/latency shape** | One scoring pass over the whole catalogue | One scoring pass (same cost) + a second, smaller pass over only 10 candidates — more expensive per response, bounded by the pool size |
| **When it should win** | When independent relevance is what matters and ties are rare | When the *set* matters — e.g., inspiration mode, where you don't just want 3 good destinations, you want 3 that don't feel redundant together |

**Switching is one parameter.** `sageEngine.respond({ utterance, strategy: 'ranking' })` vs `strategy: 'reranking'` — nothing else in the call changes, and both return the identical response schema, which is exactly what makes a future swap (or an A/B test running both at once) low-risk to ship.

**Honest caveat for your stakeholder conversation:** with the current mock scorer, the two strategies often produce identical output on the golden set (verified — see §5) because the heuristic scores tie frequently (a handful of discrete keyword-match buckets, not a continuous distribution). That's expected and not a bug: real divergence between the two methodologies shows up once `llmClient.js` is backed by an actual model producing continuous, higher-cardinality scores, where ties become rare and the joint re-optimization in Step 2 has more room to differ from an independent cut. The eval harness in §5 is exactly the mechanism to detect and quantify that divergence when it starts to matter — you don't need to guess, you re-run `node evals/runEval.js` and read the diff.

---

## 5. AI Evaluation Framework

Two layers, deliberately different in purpose — don't conflate them when presenting:

| | **Golden-set evals** (`evals/`) | **Production feedback** (§6) |
|---|---|---|
| **Source of truth** | 8 hand-written test conversations covering every persona in the PRD + the specific PRD acceptance criteria (July-monsoon check, budget-tier hard filter) | Real 👍/👎/save/never-show actions from real users |
| **Runs** | On demand, offline, deterministic — same input always gives the same output | Continuously, in production |
| **Answers** | "Did we just break something?" (regression) and "Do ranking and re-ranking behave differently on known cases?" | "Do real people actually prefer one strategy's picks?" |
| **Command** | `node evals/runEval.js` | N/A — accumulates as the app is used |

### 5.1 What each metric means (for your stakeholder deck)

| Metric | Plain-language meaning | Why it's tracked |
|---|---|---|
| `result_count_pass_rate` | Fraction of conversations where exactly 3 destinations came back | PRD hard requirement — never more, never fewer |
| `diversity_pass_rate` | Fraction where no 2 of the 3 results share a primary category (e.g., not 3 beaches) | Directly tests the "don't show 3 similar destinations" principle |
| `constraint_violation_count` | Count of hard-rule breaks — e.g., a July query returning a monsoon-avoid destination with no warning flag | Should always be 0; if it isn't, something in `constraints.js` regressed |
| `avg_explanation_groundedness` | Fraction of personalized reasons that actually reference something the user said (mood, negative preference, budget, season) | Tests the PRD's core "explainability" promise, not just that *a* sentence was generated |
| `avg_hidden_gem_score` | Average offbeat-ness (1–10) of what got recommended | Useful mainly in inspiration-mode cases — should rise when a user says "surprise me" |
| `avg_latency_ms` | How long the engine took (currently near-zero since there's no network call yet; will become meaningful once real LLM calls are wired in) | Re-ranking's second pass should show up here first once real model latency is in the loop |

### 5.2 First eval run — actual baseline (reproduce with `node evals/runEval.js`)

| Metric | Ranking | Re-ranking |
|---|---|---|
| total_cases | 8 | 8 |
| result_count_pass_rate | 1.0 | 1.0 |
| diversity_pass_rate | 1.0 | 1.0 |
| constraint_violation_count | 0 | 0 |
| avg_explanation_groundedness | 1.0 | 1.0 |
| avg_hidden_gem_score | 4.585 | 4.585 |
| avg_latency_ms | 0.125 | 0.25 |

Read this as: **both strategies currently clear every hard bar with the mock scorer** — the engine is correct and safe to demo. The metrics that will actually differentiate the two strategies (explanation quality nuance, real relevance, real user preference) only become discriminating once real user feedback (§6) or a real LLM scorer is in the loop — this table is a correctness baseline, not yet a "which one is better" verdict, and you should frame it that way to stakeholders rather than overclaiming.

The golden set itself (`evals/golden-conversations.json`) is inspectable and extensible — add a new persona or edge case as a new entry with an `expected` block, and it's automatically included in the next run. This is the artifact to grow over time as real conversations reveal edge cases the original 8 didn't anticipate.

### 5.3 Files produced by every run

- `evals/eval-report.json` — full machine-readable detail, one row per (conversation × strategy)
- `evals/eval-report.md` — the table above, auto-generated, safe to paste directly into a stakeholder doc

---

## 6. Feedback Capture (Production Signal)

`evals/feedbackSchema.js` defines the event shape the UI should emit on every user action, tagged with which strategy produced the recommendation it's reacting to:

```json
{
  "session_id": "string",
  "turn_id": "string",
  "destination_id": "spiti-valley",
  "signal_type": "thumbs_up | thumbs_down | save | never_show | tell_me_more | dwell_time",
  "value": null,
  "reason": "optional free text, e.g. rejection reason",
  "strategy_used": "ranking | reranking",
  "timestamp": "ISO 8601"
}
```

`aggregateByStrategy(events)` rolls a stream of these into per-strategy `positive_rate` and `negative_rate` — the production-side counterpart to the golden-set metrics in §5. Once the app is live (even in demo/portfolio use), every session contributes to this aggregate, and `positive_rate` by strategy is the number that eventually settles the ranking-vs-re-ranking question with real evidence instead of a guess.

**Implementation note for the PM, not just the engineer:** this only becomes useful if `strategy_used` is actually recorded on every feedback event — it's one field, but it's the one field that makes a future "should we switch to re-ranking" conversation answerable instead of anecdotal. Flag this explicitly in the engineering handoff; it's easy to forget because it doesn't affect what the user sees.

---

## 7. Decision Framework: When to Switch Strategies

Bring this rubric, not just the raw numbers, to the "should we switch?" conversation:

1. **Golden-set correctness gate (must pass, non-negotiable):** `constraint_violation_count` must be 0 and `result_count_pass_rate` must be 1.0 for the candidate strategy. Anything lower disqualifies it regardless of how good the feedback numbers look.
2. **Production preference signal (the actual decision driver):** compare `positive_rate` (👍 + save) between strategies over a comparable volume of real sessions — not just golden-set output, which is currently near-identical between the two (§5.2).
3. **Latency budget check:** re-ranking's two-pass structure costs more once real model calls replace the mock — compare `avg_latency_ms` against the PRD's NFR target (first recommendation within ~4s). A strategy that wins on preference but blows the latency budget needs a scoped-down retrieval pool (`RETRIEVAL_POOL_SIZE` in `reranking.js`), not an outright rejection.
4. **Sample size honesty:** don't declare a winner on a handful of sessions. Note the session count alongside any `positive_rate` comparison you present — a PM's most common credibility mistake here is presenting an early trend as a conclusion.

---

## 8. How to Present This to Stakeholders

A suggested narrative arc, using only artifacts that already exist in this repo:

1. **The dataset is real and balanced** — pull the table in §2 straight from `destinations.json`.
2. **The engine works today, without waiting on an API key** — run `node engine/demo.js` live if presenting in person; it responds instantly because there's no network call yet.
3. **We didn't just build one ranking approach — we built the ability to compare two, safely** — show the ranking-vs-reranking table (§4) and explain the swap is a one-line change (`strategy: 'ranking' | 'reranking'`), which de-risks the "what if we need to change methodology later" question stakeholders will ask.
4. **We've already instrumented ourselves to answer 'which is better' with data, not opinion** — show the eval table in §5.2, and explain honestly that today it's a correctness baseline (both pass), with the real differentiator (§6, §7) arriving once real users generate feedback.
5. **Close with the decision framework (§7)** — this signals PM maturity: you're not asking stakeholders to trust a gut call later, you've pre-committed to the criteria that will make the call.

---

## 9. Repo Manifest

```
TravelOSum/
  destinations.json                          50-destination dataset
  PRD_TravelOSum_Portfolio.md                portfolio-phase PRD (scope decisions, still authoritative except dataset size)
  PRD_TravelOSum_v2_Engine_and_Evals.md      this document
  engine/
    destinationStore.js
    constraints.js
    llmClient.js
    ranking.js
    reranking.js
    sageEngine.js
    demo.js
  evals/
    feedbackSchema.js
    golden-conversations.json
    metrics.js
    runEval.js
    eval-report.json                         generated by runEval.js
    eval-report.md                           generated by runEval.js
```

---

## 10. What's Deliberately Not Built Yet

Consistent with the portfolio PRD's phasing — flagging so it's not mistaken for an oversight:

- No voice layer, no UI, no destination cards yet — this document covers the reasoning engine and its evaluation only.
- No real Gemini/Claude call yet — `llmClient.js` is the seam, not the integration (see §3.2).
- No persisted feedback store yet — `feedbackSchema.js` defines the shape; wiring it to localStorage (per the portfolio PRD's architecture) is a UI-layer task, not an engine task.
- No statistical significance testing on production feedback yet — §7's framework tells you what to compare; building an actual significance calculator is worth doing once there's enough session volume to need one, not before.
