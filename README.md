# TravelOSum

**AI voice destination discovery engine.**

TravelOSum is a conversational travel discovery assistant ("Sage") scoped to a curated set of Indian destinations. Instead of filters and top-10 lists, it understands traveler intent through conversation — mood, budget, season, group type, things explicitly ruled out — and returns 3 explainable recommendations at a time.

This repo currently contains the **product planning** and the **recommendation engine + evaluation harness**. Frontend, backend, and accounts are specified but not yet built — see [Status](#status) below.

---

## What exists right now

### 1. Curated destination dataset — `destinations.json`
50 hand-curated Indian destinations, deliberately spread across:
- **Region:** North India (12) · South India (10) · West India (8) · East India (6) · Central India (5) · Northeast India (7) · Islands (2)
- **Budget tier:** Mid (24) · Budget (19) · Premium (7)
- **Type:** Offbeat, hill-station, spiritual, heritage, beach, mountain, wildlife, city, desert, backwater
- **Hidden-gem score:** 1 (North Goa) to 9 (Chettinad, Gopalpur-on-Sea, Ziro Valley, Majuli, Tawang, Lakshadweep)

Each entry carries budget range, best/avoid travel months, monsoon sensitivity, ideal trip duration, crowd level, hidden-gem score, top highlights, nearest cities, matching tags, and group suitability — validated for schema consistency and unique IDs.

### 2. Recommendation engine — `engine/`
A working, dependency-free Node.js implementation of Sage's reasoning:

| File | Responsibility |
|---|---|
| `destinationStore.js` | Loads and caches `destinations.json` |
| `constraints.js` | Hard filters (budget-tier gap, avoid-months, negative preferences) + soft flags, with a two-step relaxation ladder so the app always returns 3 results |
| `llmClient.js` | The **only** file that stands in for real AI calls — currently deterministic keyword/regex heuristics (intent extraction, explanation generation), isolated so a real Gemini/Claude integration later means rewriting this one file, not the engine |
| `ranking.js` | **Strategy A** — score every candidate independently (semantic 40% / season fit 30% / preference 20% / hidden-gem 10%), sort, cut top 3 with a diversity post-filter |
| `reranking.js` | **Strategy B** — retrieve a wider pool (top 10), then jointly re-optimize the final 3 against what's already been picked (diversity penalty + novelty bonus recalculated at each pick) |
| `sageEngine.js` | Orchestrator — conversation turn in, structured response out; `strategy: 'ranking' \| 'reranking'` is a one-parameter swap between the two methodologies above |
| `demo.js` | Runnable example: `node engine/demo.js` |

Run it:
```bash
node engine/demo.js
```

#### Ranking vs. re-ranking — the methodology swap

| | **Ranking** (default) | **Re-ranking** |
|---|---|---|
| **Step 1** | Score every candidate independently (semantic 40% / season fit 30% / session preference 20% / hidden-gem 10%) | Same independent scoring, but keep a wider pool — top 10, not just top 3 |
| **Step 2** | Sort by score, walk down the list, keep the first 3 that satisfy the diversity rule (no 2 share a primary type) — diversity is a **post-hoc filter** over independently-scored items | Greedily select 3 from the pool of 10 by **jointly re-evaluating** each remaining candidate against what's *already been picked* — diversity/novelty are recalculated at every pick, against the emerging set |
| **Where a real LLM would plug in** | The per-destination score itself | The joint re-evaluation in step 2 — this is what people usually mean by "an LLM re-ranker" |
| **When it should win** | Independent relevance is what matters, ties are rare | The *set* matters — e.g. inspiration mode, where 3 destinations shouldn't feel redundant together |

Switching is one parameter: `sageEngine.respond({ utterance, strategy: 'ranking' })` vs. `strategy: 'reranking'` — both return the identical response schema. On the current mock scorer (`llmClient.js`), the two strategies often tie on the golden set (discrete keyword-match buckets, not continuous scores) — that's expected, not a bug. Real divergence shows up once `llmClient.js` is backed by an actual model producing continuous, higher-cardinality scores; the eval harness below is what detects and quantifies that divergence when it starts to matter.

### 3. AI evaluation framework — `evals/`
Two layers, kept deliberately distinct:

- **Golden-set regression evals** (`golden-conversations.json`, `metrics.js`, `runEval.js`) — 8 hand-written test conversations covering every persona in the PRD plus specific acceptance criteria (e.g. "a July query must never return a monsoon-avoid destination without a flag"). Runs both `ranking` and `reranking` against the same set and reports result-count pass rate, diversity pass rate, constraint violations, explanation groundedness, average hidden-gem score, and latency — machine-readable (`eval-report.json`) and stakeholder-readable (`eval-report.md`).
- **Production feedback schema** (`feedbackSchema.js`) — the event shape (👍/👎/save/never-show/tell-me-more/dwell-time) real user actions will emit once the app is live, tagged with which strategy produced the recommendation, so `ranking` vs. `reranking` can eventually be compared on real preference data, not just golden-set correctness.

Run it:
```bash
node evals/runEval.js
```

#### What each metric means

| Metric | Plain-language meaning |
|---|---|
| `result_count_pass_rate` | Fraction of conversations where exactly 3 destinations came back |
| `diversity_pass_rate` | Fraction where no 2 of the 3 results share a primary category (e.g. not 3 beaches) |
| `constraint_violation_count` | Count of hard-rule breaks (e.g. a July query returning a monsoon-avoid destination with no warning flag) — should always be 0 |
| `avg_explanation_groundedness` | Fraction of personalized reasons that actually reference something the user said (mood, negative preference, budget, season) |
| `avg_hidden_gem_score` | Average offbeat-ness (1–10) of what got recommended — should rise in inspiration mode |
| `avg_latency_ms` | Engine time per response (near-zero today since there's no network call yet; becomes meaningful once real LLM calls are wired in) |

**Current baseline** (reproduce with `node evals/runEval.js`): both strategies clear every hard-constraint check on the golden set — `result_count_pass_rate` 1.0, `diversity_pass_rate` 1.0, `constraint_violation_count` 0, `avg_explanation_groundedness` 1.0, for both `ranking` and `reranking`. Read this as a **correctness floor, not yet a "which is better" verdict** — the golden set proves both strategies are safe to demo; the real differentiator is production feedback (below).

#### Deciding when to switch strategies in production

1. **Correctness gate (non-negotiable):** a candidate strategy must show `constraint_violation_count = 0` and `result_count_pass_rate = 1.0` on the golden set before it's even considered.
2. **Real preference signal:** compare `positive_rate` (👍 + save) between strategies via `feedbackSchema.aggregateByStrategy()` over a comparable volume of real sessions — not golden-set output, which is currently near-identical between the two.
3. **Latency budget:** re-ranking's two-pass structure costs more once real model calls replace the mock — check `avg_latency_ms` against the product's "first recommendation within ~4s" target before shipping it broadly.
4. **Sample-size honesty:** don't declare a winner on a handful of sessions — report the session count alongside any `positive_rate` comparison.

### 4. Product documentation
- **`PRD_TravelOSum.md`** (v0.2) — the active product spec: accounts (managed auth), a real backend, app navigation (About / Browse Destinations / Packages / Book Destinations / Travel History / Cancellation History), a persistent right-side voice assistant panel, conversation logging, and an owner-only traceable evals view. Explicitly scoped as **simulated booking only** (no payment gateway/real inventory) and **no RAG/vector database for v1** (the 50-destination catalogue is small and structured enough that a compact prompt index outperforms embeddings-based retrieval — see §7 of that document for when that would change).

The recommendation-engine architecture and evaluation framework (ranking vs. re-ranking, metric definitions, decision framework) are documented directly in this README rather than in a separate PRD.

---

## Status

| Layer | Status |
|---|---|
| Destination dataset | ✅ Built and validated (50 entries) |
| Recommendation engine (ranking + re-ranking) | ✅ Built and verified (`node engine/demo.js`) |
| Evaluation harness (golden-set + feedback schema) | ✅ Built and verified (`node evals/runEval.js`) |
| Product PRD | ✅ Written; v0.2 has open questions pending review (see that document's final section) |
| Frontend (React) | ⬜ Not started |
| Backend (accounts, bookings, conversation logging, admin evals view) | ⬜ Not started |
| Real LLM integration (Gemini/Claude) | ⬜ Not started — `engine/llmClient.js` is the seam, currently mocked |

---

## Repo layout

```
TravelOSum/
  README.md
  PRD_TravelOSum.md                        active product spec (v0.2)
  destinations.json                        50-destination dataset
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
    eval-report.json                        generated by runEval.js
    eval-report.md                          generated by runEval.js
```

## Requirements

Node.js (any recent version) — no `npm install` needed, the engine and evals use zero external dependencies by design, so they run and stay reproducible without an API key.

## Next steps

Per `PRD_TravelOSum.md` §14 (Phased Build Plan): accounts/backend foundation, then navigation sections, then simulated booking/history, then the voice panel wired to a real backend with conversation logging, then the owner-only evals view.
