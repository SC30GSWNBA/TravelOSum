# Product Requirements Document
# TravelOSum — AI Voice Destination Discovery Engine
## v0.2 — Accounts, Backend & Full App Surface

---

| | |
|---|---|
| **Product** | TravelOSum — AI Voice Destination Discovery Engine |
| **Author** | Sudip Roy |
| **Version** | v0.2 — now with accounts, backend, and full navigation |
| **Scope** | 50 curated Indian destinations, user accounts, simulated booking, admin-traceable evals |
| **Status** | Final for build |
| **Supersedes** | v0.1 of this document (localStorage-only, no-backend scope) |
| **Companion doc** | `README.md` (recommendation engine architecture + evaluation framework — unchanged by this revision) |
| **Last Updated** | July 2026 |

> **This revision reverses several v0.1 scope decisions on purpose.** v0.1 deliberately kept this app backend-free and account-free to minimize build time. That's no longer the brief — accounts, a real backend, booking, and history are now explicitly requested. This document keeps the same lean discipline (small, fast, low-risk defaults) while expanding the *surface area* to match. Every place this document makes a judgment call instead of asking, it says so — see §15 for the three calls made up front and the reasoning.

---

## Table of Contents

1. [Purpose & Hypothesis](#1-purpose--hypothesis)
2. [Design Principles](#2-design-principles)
3. [Scope Boundaries (Updated)](#3-scope-boundaries-updated)
4. [Feature Requirements](#4-feature-requirements)
5. [Data Model](#5-data-model)
6. [Technical Architecture](#6-technical-architecture)
7. [RAG & Vector Database Decision](#7-rag--vector-database-decision)
8. [Frontend Design](#8-frontend-design)
9. [Backend Design](#9-backend-design)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Success Criteria](#11-success-criteria)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Path to Full-Scale](#13-path-to-full-scale)
14. [Phased Build Plan](#14-phased-build-plan)
15. [Decisions Made vs. Still Open](#15-decisions-made-vs-still-open)

---

## 1. Purpose & Hypothesis

TravelOSum is a voice-and-text AI travel discovery assistant. The v0.1 hypothesis — that conversational AI can out-recommend filter-based search within a single session, without needing a backend — still holds and is what the recommendation engine (`engine/`) and eval harness (`evals/`) already prove (see README.md).

This revision adds the second half of what a real product needs: **an actual account, a place to keep coming back to, and a way to see what you did before.** The updated hypothesis:

> *"A traveler should be able to create an account, have a real conversation with Sage, browse and 'book' a destination, and see that trip reflected in their history — as a coherent app, not a disconnected chat demo."*

This is still a small, fast build, not a commercial launch: no real payments, no real inventory, no real customer support obligations. See §3 for exactly where the "simulated" line is drawn.

---

## 2. Design Principles

Unchanged from v0.1, plus one addition made necessary by simulated booking:

1. **Conversation over configuration.**
2. **Explain everything.**
3. **Constraints are first-class.**
4. **Delight through surprise.**
5. **Memory within a session is non-negotiable; cross-session learning is simulated, not a live engine** (v0.1 decision, unchanged).
6. **Never let "simulated" look like "real."** Anywhere the app shows a booking, confirmation ID, or cancellation, it must be visibly and unambiguously a demo artifact — no real payment amounts implied as charged, no fake transaction IDs formatted to look like a real gateway's. This isn't just an ethics nicety: a public demo URL that *looks* like it processed a real payment is a trust and legal problem the moment anyone screenshots it out of context.

---

## 3. Scope Boundaries (Updated)

| Area | v0.1 decision | v0.2 decision | Why it changed |
|---|---|---|---|
| Backend | None — localStorage only | **Real backend required** (§9) | Accounts, booking, and cross-device history can't live in localStorage |
| Accounts | None | **Real signup/login** via a managed auth provider (§9) | Explicitly requested; must persist across devices/sessions |
| Booking | Explicitly out of scope | **Simulated booking only** — no payment gateway, no real inventory | Confirmed via your input: full payment integration is out of scope for this build's timeline; "Book Destinations" and history pages are demo-data flows tied to the real account |
| Frontend stack | Vanilla JS (no framework) | **React** | Confirmed via your input: auth-gated routes, forms, and multi-section nav outgrow hand-rolled DOM state management |
| Vector DB / RAG | Not discussed | **Not used in v1** (§7) | At 50–100 structured destinations, a compact catalogue index in the prompt outperforms embeddings-based retrieval on cost and simplicity; revisit only if the catalogue or content type changes materially |
| Cross-session learning | Simulated via one demo profile | **Unchanged** — still simulated, now backed by a real per-user row instead of a hardcoded object | Real accounts make "returning user" data structurally real, but the *learning engine* itself (tag-weight reinforcement) is still deferred to full-scale (§13), same reasoning as v0.1 |
| Destination catalogue | 25 (then expanded to 50 during build) | **50**, unchanged | Already built and validated |

Everything else in v0.1's scope boundaries (no proactive nudges, no itinerary builder, no international destinations, no native app) is unchanged.

---

## 4. Feature Requirements

FR-01 through FR-10 are unchanged from v0.1 (voice/text input, Sage engine, recommendation engine, destination cards, seasonality, budget, session memory, feedback, inspiration/planning mode, onboarding) — see that document's §6 for full detail, and README.md for how the recommendation engine itself works. New requirements below.

### FR-11: Account Creation & Login

| Attribute | Requirement |
|---|---|
| **Sign-up** | Email + password (or a social login the auth provider supports out of the box, e.g., Google) |
| **Login** | Existing credentials; session persists across browser restarts until explicit logout |
| **Password handling** | Never touches app code directly — delegated entirely to the managed auth provider (§9); the app never stores or sees a raw password |
| **Session** | Auth provider's session/token handling; app checks session validity on load and route change |
| **Account deletion** | One-click "delete my account" that removes the user row, their bookings, their conversation logs, and their feedback events — the direct successor to v0.1's "wipe my localStorage profile" promise, now meaningful because the data actually lives server-side |

**Acceptance criteria:**
- A new user can create an account and land in the app within 2 steps (no email verification gate blocking first use, though verification can be sent async)
- A returning user's session and history are the same regardless of device, once logged in
- Logout fully clears client-side session state; no stale authenticated UI after logout

---

### FR-12: App Navigation

Persistent side navigation with the following sections (as requested):

| Section | Purpose |
|---|---|
| **About TravelOSum** | Static content — what the app is, how Sage works, a short explainer of the AI reasoning (good surface for technical reviewers) |
| **Browse Destinations** | Non-conversational grid/filter view of all 50 destinations (filter by region, type, budget tier, best month) — a deliberate second path into the same catalogue the AI uses, useful in a demo to contrast "here's filtering" vs. "here's Sage understanding you" |
| **Packages** | A small set of hand-curated multi-destination bundles (e.g., "Golden Triangle," "Kerala Backwaters + Munnar") composed from the existing 50-destination catalogue with a combined price estimate — content, not a new data system. *(Flagged in §15 — confirm this is the intended reading of "Packages.")* |
| **Book Destinations** | Simulated booking flow (§4 FR-16) |
| **Travel History** | List of the account's confirmed (simulated) bookings |
| **Cancellation History** | List of the account's cancelled (simulated) bookings, with the cancellation reason if one was given |
| **Log Out** | Ends the session, returns to the logged-out landing/login screen |

**Acceptance criteria:**
- All sections except About and Browse require an active session; unauthenticated access redirects to login
- Navigation state (which section is active) is preserved across the voice panel being open or closed

---

### FR-13: Persistent Voice Assistant Panel

Repositioned from "the app is a conversation" (v0.1 framing) to **"the app has sections, and Sage is always reachable"**:

| Attribute | Requirement |
|---|---|
| **Placement** | Fixed panel on the right side of the screen, present across all authenticated sections, collapsible |
| **Behavior** | Same conversation engine as before (`engine/sageEngine.js`) — voice-optional, text-first-parity, per v0.1's FR-01 |
| **Context awareness** | Sage's context panel reflects the current session's conversation regardless of which nav section is active — switching from Browse Destinations to Packages does not reset the conversation |
| **Cross-linking** | A destination Sage recommends can be opened directly in Browse Destinations or taken straight into the Book Destinations flow |

This resolves a tension from v0.1 more cleanly than before: voice was originally the *primary* interface, which sat awkwardly against Safari/iOS's weak Web Speech API support. With navigation sections as the primary structure and Sage as an always-available assistant alongside them, "voice-optional" stops being a compromise and becomes the natural shape of the product.

---

### FR-14: Query & Response Logging

Every conversation turn — user utterance, Sage's structured response, which strategy (`ranking`/`reranking`) produced it, and timestamps — is persisted server-side, tied to the account.

| Attribute | Requirement |
|---|---|
| **What's stored** | `user_id`, `session_id`, `turn_id`, raw utterance, full structured response JSON (per the response schema described in README.md), `strategy_used`, `latency_ms`, `timestamp` |
| **Why** | (a) powers Travel History/"what Sage knows about you" continuity across devices, (b) is the raw material for the owner-traceable evals in FR-15, (c) becomes a real (not golden-set-only) corpus for expanding `evals/golden-conversations.json` later |
| **Retention/privacy** | Included in the account-deletion flow (FR-11); disclosed in-app that conversation text is stored, consistent with the existing disclosure that conversation text is sent to the LLM |

---

### FR-15: Owner-Traceable AI Evals

An admin-only view, accessible solely to you as the app owner, distinct from anything a regular user sees:

| Attribute | Requirement |
|---|---|
| **Access control** | Gated by an `is_owner` flag on the account row (or a separate admin credential) — never exposed in the regular app nav |
| **What it shows** | (a) The existing golden-set eval report (`evals/eval-report.json`/`.md`, per README.md) rendered in-app rather than only via CLI, (b) real usage aggregates from FR-14's logs and the feedback events (👍/👎/save/never-show) — positive/negative rate **per strategy**, per the `aggregateByStrategy` function already built in `evals/feedbackSchema.js`, (c) the ability to drill into an individual session's full conversation trace |
| **Why it's separate from the golden-set CLI tooling** | The CLI (`node evals/runEval.js`) answers "did we break something" and is a build-time tool. This view answers "what are real users actually experiencing," which only exists once FR-14 is collecting real traffic — the two are complementary, not duplicates |

**Acceptance criteria:**
- No non-owner account can reach this view, by URL guessing or otherwise (server-side check, not just hidden UI)
- The per-strategy comparison shown here uses the same metric definitions as README.md, so a number here means the same thing as the same-named number in a CLI report

---

### FR-16: Simulated Booking & Cancellation

Per the confirmed decision in §3: no payment gateway, no real inventory.

| Attribute | Requirement |
|---|---|
| **Book flow** | User selects a destination (from Sage's recommendation, or from Browse Destinations), picks travel dates and traveler count, confirms — creates a booking record with status `confirmed` and a generated reference code |
| **Visual disclosure** | Every booking screen and confirmation clearly labels itself as a demo/simulation — no real payment step, no real amount charged, reference code visibly distinct from real airline/hotel PNR formats |
| **Cancellation** | From Travel History, a confirmed booking can be cancelled — moves it to Cancellation History with an optional reason, status becomes `cancelled` |
| **Cost estimate shown** | Pulled from the destination's existing `budget` field in `destinations.json` — no new pricing system needed |

---

### FR-17: About TravelOSum

Static page: what the product is, the Sage persona, a short "how the AI reasons" explainer aimed at a technical reviewer audience — this is narrative surface, not a feature with acceptance criteria beyond "renders correctly."

### FR-18: Browse Destinations

Filterable grid over all 50 destinations (region, type, budget tier, best month) using the existing `destinations.json` — no new backend query complexity, this is a client-side filter over a small, already-loaded dataset. Selecting a destination shows the same card detail as a Sage recommendation would (FR-04 in v0.1).

### FR-19: Packages

A hand-curated JSON list (5–8 entries to start) of named multi-destination bundles referencing existing destination `id`s, e.g.:

```json
{
  "id": "golden-triangle",
  "name": "Golden Triangle",
  "destinations": ["jaipur", "udaipur", "khajuraho"],
  "suggested_duration_days": 7,
  "description": "Rajasthan's royal heritage circuit, extended east to Khajuraho's temple architecture."
}
```

No new destination data required — packages are a thin composition layer over the existing 50 entries.

---

## 5. Data Model

Extends the schemas already defined in `destinations.json` and README.md. New tables/collections needed once a real backend exists (§9):

### 5.1 `users`

```json
{
  "id": "uuid, managed by auth provider",
  "email": "string",
  "display_name": "string",
  "home_city": "string | null",
  "is_owner": "boolean, default false",
  "created_at": "timestamp",
  "last_active_at": "timestamp"
}
```

### 5.2 `session_profile` (per user — successor to v0.1's localStorage profile)

```json
{
  "user_id": "uuid",
  "liked_tags": { "tag": "weight" },
  "disliked_tags": { "tag": "weight" },
  "rejected_destinations": ["destination_id"],
  "wishlist": ["destination_id"],
  "is_demo_profile": "boolean — true only for the pre-loaded 'returning user' demo account, per v0.1 FR-07"
}
```

### 5.3 `bookings`

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "destination_id": "string, references destinations.json id",
  "travel_start_date": "date",
  "travel_end_date": "date",
  "traveler_count": "integer",
  "estimated_cost_inr": "integer, derived from destination.budget",
  "status": "confirmed | cancelled",
  "cancellation_reason": "string | null",
  "reference_code": "string, clearly non-real-PNR format e.g. TOS-DEMO-XXXXX",
  "created_at": "timestamp",
  "cancelled_at": "timestamp | null"
}
```

### 5.4 `conversation_logs` (FR-14)

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "session_id": "string",
  "turn_id": "string",
  "utterance": "string",
  "response_json": "object — full Sage response schema",
  "strategy_used": "ranking | reranking",
  "latency_ms": "integer",
  "created_at": "timestamp"
}
```

### 5.5 `feedback_events`

Directly the shape already defined in `evals/feedbackSchema.js`, now persisted per-user instead of only in-memory — no schema change needed, just a storage backend behind the same `createFeedbackEvent` shape.

---

## 6. Technical Architecture

```
┌───────────────────────────────┐        ┌───────────────────────────────────┐
│      React Frontend           │        │   Backend (managed auth + DB)      │
│                                │        │   e.g. Supabase                    │
│  Nav shell: About / Browse /  │◀──────▶│   - Auth (signup/login/session)    │
│  Packages / Book / History /  │  REST/ │   - Postgres: users, bookings,     │
│  Cancellations / Logout       │  RPC   │     session_profile,               │
│                                │        │     conversation_logs,             │
│  Right-side Voice Panel       │        │     feedback_events                │
│  (Web Speech I/O + transcript)│        │   - Row-level security: users only │
│                                │        │     read/write their own rows,     │
│  Sage orchestration (client)  │──────▶│     owner flag unlocks FR-15 view  │
│   - engine/sageEngine.js      │  calls │                                     │
│   - prompt builder             │        └──────────────┬──────────────────────┘
└───────────────────────────────┘                       │
              │                                          ▼
              │                                ┌───────────────────────┐
              ▼                                │  Serverless LLM proxy  │
      destinations.json                        │  (holds Gemini/Claude  │
      + packages.json                          │   key — unchanged from │
      (bundled with app)                       │   README.md)          │
                                                └───────────────────────┘
```

Key changes from v0.1's architecture: the browser is no longer the only place state lives — `users`, `bookings`, `session_profile`, `conversation_logs`, and `feedback_events` move server-side. The LLM proxy described in README.md is unchanged; it now sits behind the same backend rather than as a lone serverless function.

---

## 7. RAG & Vector Database Decision

Explicitly asked for ("if needed") — the answer for this phase is **no**, with the reasoning laid out so it can be revisited on its merits later rather than defaulted into out of habit.

**Why not now:**
- The entire catalogue is 50 structured entries. A compact index (id, tags, budget tier, best/avoid months) already fits comfortably in the LLM's prompt context in full — there's nothing for a vector database to retrieve that isn't already right there.
- RAG/vector search earns its cost when either (a) the corpus is too large to fit in context, or (b) the content is unstructured free text (long-form guides, user-written reviews) where semantic similarity search meaningfully beats exact tag filtering. TravelOSum has neither condition yet — everything is small, structured, and tag-rich, which is exactly the case where simple filtering plus LLM reasoning (what `constraints.js` + `ranking.js`/`reranking.js` already do) outperforms embeddings on cost, latency, and debuggability.
- Standing up embeddings + a vector store (Pinecone, pgvector, etc.) for 50 rows adds infrastructure and a new failure mode for no measurable retrieval-quality gain at this scale.

**When this should be revisited (tracked in §13, not built now):**
- The catalogue grows into the many hundreds/thousands (full-scale phase's eventual 100+ destination expansion is still small enough to defer this; a jump to, say, 1,000+ would change the calculus).
- Long-form unstructured content is added — real user-written reviews, blog-style destination guides — where "find me something like this paragraph" genuinely needs semantic search over free text rather than structured tags.
- Conversation history grows long enough that retrieving *relevant past turns* (rather than passing full history, the current approach) becomes necessary for cost/latency reasons.

If any of those become true, `pgvector` (an extension of the same Postgres instance recommended in §9) is the lowest-friction next step — no new infrastructure vendor, just a new column type and an embedding call added to the ingestion path.

---

## 8. Frontend Design

**Stack: React**, per the confirmed decision in §3 — the original "vanilla JS to show raw skill" rationale from the earlier full-scale PRD made sense for a single-conversation-panel app; it stops making sense once there are auth-gated routes, multi-step forms (booking), and persistent nav state to manage. React's component model and a lightweight router (e.g., React Router) directly replace what would otherwise be hand-rolled state machines.

**Page/route structure:**
```
/                      → logged-out landing (login/signup)
/app                   → authenticated shell (nav + right-side voice panel)
  /app/about
  /app/browse
  /app/packages
  /app/book/:destinationId?
  /app/history/travel
  /app/history/cancellations
/app/admin/evals        → owner-only, FR-15
```

**State management:** kept intentionally simple — React context for the auth session and the active Sage conversation, no global state library needed at this scale. The voice panel's conversation state is lifted to the app shell (not per-route) precisely so switching nav sections doesn't reset it, per FR-13.

**Design language:** carried over from v0.1's Phase 4 polish goals (glassmorphism, card transitions, waveform visualization) — unchanged in spirit, now implemented as React components instead of vanilla DOM manipulation.

---

## 9. Backend Design

**Provider: Supabase**, per the confirmed decision in §3 (managed auth + hosted Postgres + row-level security), chosen over a hand-rolled Node/Express + custom auth stack for one reason: it collapses "build auth" and "build a database" into configuration rather than code, which is where a lean build timeline is most at risk of stalling. Firebase is a reasonable alternative if there's an existing preference; Supabase is recommended here because the relational shape of `users` → `bookings`/`conversation_logs`/`feedback_events` (§5) maps directly onto Postgres tables and foreign keys rather than a document store.

**What Supabase provides out of the box:**
- Email/password + social login, session/token handling — the app never touches a raw password
- Postgres database for the schemas in §5
- Row-level security policies: a plain rule per table ("users can only read/write rows where `user_id = auth.uid()`"), plus one additional policy on the admin view unlocking rows for accounts where `is_owner = true` — this is what makes FR-15's access control a database-level guarantee, not just a hidden frontend route
- Auto-generated REST/RPC API over the schema, removing the need to hand-write CRUD endpoints for bookings/history

**What still needs custom code:**
- The serverless LLM proxy (unchanged from README.md) — Supabase doesn't replace this, it sits alongside it holding the Gemini/Claude key
- The Sage orchestration logic (`engine/`) — this is business logic, not a database concern, and stays exactly as built
- The FR-15 admin aggregation view (reading `conversation_logs` + `feedback_events` and computing the same metrics as `evals/metrics.js`, server-side)

---

## 10. Non-Functional Requirements

Extends v0.1's NFRs (unchanged: performance targets, browser support for voice, accessibility) with what real accounts and stored data require:

| Category | Requirement |
|---|---|
| **Auth security** | Delegated entirely to the managed provider (§9) — no custom password hashing or session token logic written in-house |
| **Data access control** | Enforced via row-level security at the database layer, not just application logic — a user must be structurally unable to query another user's bookings or conversation logs, even with a crafted request |
| **Account deletion** | Removes all rows across `users`, `bookings`, `session_profile`, `conversation_logs`, `feedback_events` for that account — no orphaned PII |
| **Booking disclosure** | Every booking-related screen visibly indicates simulation status (§2, principle 6) |
| **Conversation data disclosure** | In-app privacy notice updated from v0.1's "conversation text is sent to the LLM" to also cover "and stored against your account, viewable in your own history, never visible to other users" |

---

## 11. Success Criteria

Extends v0.1's demo-checkable criteria list with:

- A new user can sign up, have a Sage conversation, book a recommended destination, see it in Travel History, cancel it, and see it move to Cancellation History — all in one sitting, without hitting an error state
- Logging out and back in (same device or a different one) restores the same account, bookings, and history
- The owner-only evals view is reachable only from an owner account, and a non-owner account attempting the URL directly is blocked
- Every booking/cancellation screen is unambiguous about being a simulation on first glance, without needing to read fine print

---

## 12. Risks & Mitigations

Extends v0.1's risk table:

| Risk | Mitigation |
|---|---|
| Custom auth security bugs (password storage, session fixation, etc.) | Avoided entirely by delegating to a managed provider (§9) rather than hand-rolling |
| A user perceives a "confirmed booking" as a real reservation | Explicit, persistent visual disclosure on every booking-related screen (§2, §4 FR-16) |
| Row-level security misconfigured, leaking one user's bookings/conversations to another | Treat RLS policies as a reviewed part of the build, not an afterthought — test with two real accounts before considering FR-11/FR-14 done |
| Scope roughly doubles versus v0.1 (accounts + backend + booking + admin view, on top of the existing engine/evals work, documented in README.md) | Sequence via the phased plan in §14 rather than building all surfaces at once; the recommendation engine and evals (already built, documented in README.md) are unaffected and don't need to be redone |
| "Packages" feature built to the wrong interpretation | Flagged explicitly in §15 — confirm before building FR-19 |

---

## 13. Path to Full-Scale

Unchanged in spirit from v0.1, updated for this revision:

- Real payment gateway + real inventory, replacing simulated booking (§4 FR-16) — the single biggest jump from this build to a commercial one, deliberately deferred
- Real cross-session learning engine (tag-weight reinforcement over the now-real `session_profile` rows), superseding the still-simulated version
- Vector DB (`pgvector`, per §7) if the catalogue or content type outgrows structured-filtering
- Dataset expansion from 50 toward the original 100-destination ambition
- Reinstating the original full-scale KPI table now that `conversation_logs` and `feedback_events` provide real aggregate data to measure it against

---

## 14. Phased Build Plan

**Phase 1 — Accounts & Backend Foundation**
- Stand up Supabase project; define schemas from §5 as Postgres tables with row-level security
- Signup/login flow (FR-11) in React
- Auth-gated route shell (`/app/*`)

**Phase 2 — Navigation & Content Sections**
- About, Browse Destinations, Packages (FR-17–19) — all read-only against existing `destinations.json`/`packages.json`, no new backend logic
- Confirm the "Packages" interpretation (§15) before building FR-19

**Phase 3 — Booking & History**
- Simulated booking flow, Travel History, Cancellation History (FR-16)
- Account deletion cascading across all tables (FR-11)

**Phase 4 — Voice Panel Integration & Logging**
- Right-side persistent voice panel (FR-13), wired to the existing `engine/sageEngine.js`
- Conversation logging to `conversation_logs` (FR-14)
- Feedback events persisted to `feedback_events` instead of in-memory only

**Phase 5 — Owner Eval View & Polish**
- Admin-only `/app/admin/evals` view (FR-15), reading real usage data alongside the existing golden-set report
- Visual polish pass, mobile responsiveness, Safari/voice fallback verification (carried over from v0.1)

---

## 15. Decisions Made vs. Still Open

**Made, with your confirmation, going into this revision:**
- Booking is simulated only — no payment gateway, no real inventory (§3, §4 FR-16)
- Auth uses a managed provider, not hand-rolled — Supabase specifically recommended (§9)
- Frontend moves from vanilla JS to React (§8)

**Still open — need your call before the affected phase starts:**

> **Q1 — "Packages" interpretation:** This document assumes multi-destination bundles (Golden Triangle-style) composed from the existing 50 destinations. If you meant something else (e.g., pricing/subscription tiers), FR-19 needs to be rewritten before Phase 2.

> **Q2 — Supabase vs. Firebase:** Supabase is recommended for its relational fit with the booking/history/conversation-log schema. If there's an existing organizational preference for Firebase, say so before Phase 1 — the row-level-security approach in §9 doesn't directly carry over.

> **Q3 — Owner identification for FR-15:** Should `is_owner` be a manually-set flag on your specific account row (simplest), or does this need to support multiple admin users later?

> **Q4 — Reference-code format for simulated bookings:** Any preference on the `TOS-DEMO-XXXXX`-style format proposed in §5.3, or should it follow a specific convention?
