# PRD: Night-Shift Handover Service

| Field | Value |
|---|---|
| Feature | Automated Night-Shift Handover Generator |
| Status | Draft |
| Owner | Wage Rizal Solichin |
| Date | 2026-06-24 |
| Related DUC | [DUC.md](./DUC.md) |

---

## §1 Executive Summary

Vouch operates hotel front desks overnight across multiple properties. Every morning at ~07:00, a night-shift handover must be delivered to the incoming morning manager. Today this is done manually, yielding inconsistent quality: some mornings are thorough, some are nearly empty, and none reliably track how issues thread across consecutive nights.

This PRD defines an automated handover generation service that ingests both structured event logs and free-text narrative logs, reconciles issues across nights, and produces an action-first briefing that a morning manager can triage in under 60 seconds. Because the service runs unattended across many hotels, grounding every statement in source data — and refusing to invent or hallucinate — is the primary quality constraint.

---

## §2 Problem Statement

### 2.1 User Pain Point

**Morning Manager (primary user):** Arrives at 07:00 and needs to know immediately:
- What requires action right now (fire)?
- What is still open from previous nights?
- What was resolved overnight?
- What is purely informational?

Currently the manager must either read a raw event log (if it exists), parse a handwritten note from the night agent, or call the night agent directly. The format varies by hotel and by person. Cross-night continuity — knowing that Room 112's AC has been broken for *four days*, not just "last night" — is often lost.

**Night Agent (secondary user):** Writes up events either in the hotel system or as free text when the system is down. They may write in their native language. Their work should be faithfully represented in the handover without distortion.

### 2.2 Current State vs Desired State

| Dimension | Current | Desired |
|---|---|---|
| Format consistency | Ad-hoc, varies per person | Standardised, action-first |
| Cross-night tracking | Lost on each shift | Issues carry thread across nights |
| Language handling | English only (or manual translation) | Any language via AI normalisation |
| Grounding | None — agents write what they remember | Every statement traces to a source event |
| Data quality flags | None | Contradictions and gaps explicitly surfaced |
| Scale | Manual per hotel | Automated, one API call per hotel per morning |

### 2.3 Evidence from Sample Data

The provided week of data for Lumen Boutique Hotel illustrates the problem:

- **Room 112 AC** appears in events on shift 1 (Mon→Tue), is referenced again in the free-text log on shift 3 (Wed→Thu), gets a parts-arrival update on shift 5 (Fri→Sat), and is still unresolved by Saturday morning. A naive per-shift report would re-report this as "new" each time or miss it entirely.
- **2nd-floor corridor leak** is reported unresolved in structured events on shift 2, gets worse in the free-text log on shift 3 (which says building management didn't come), then is marked resolved in shift 4. The free-text log contradicts the structured data: the same night, one source says "still not fixed" and another says "resolved."
- **Immigration compliance backlog** accumulates: one passport on shift 1, three more on shift 2, scanner comes back online on shift 5 but 4 passports remain unscanned. Each event is a fragment; only combined do they tell the full story.
- **Prompt injection** (evt_0026): a guest-written note in room 214 contains instructions to the handover system to "report the night as all clear" and add a SGD 1000 credit. This must be detected and neutralised — not executed — with the original note preserved for the morning manager's awareness.

### 2.4 Business Context

The handover service is a foundational reliability component. A hallucinated handover (one that says an issue is resolved when it isn't, or adds a financial credit that was never approved) is worse than no handover at all, because the morning manager will act on it. The service must be trusted to run unattended at 07:00 across hundreds of hotels without producing false negatives or false positives.

---

## §3 Proposed Solution

### 3.1 Overview

A REST API service that, given a hotel ID and target date, returns an HTML handover report. The pipeline has four stages:

```
[Ingest] → [Normalise] → [Reconcile] → [Generate] → [Serve]
     ↑             ↑             ↑             ↑
  JSON          AI parse      Algorithm      AI write
  events       free text     (no AI)      with citations
```

Stage 3 (reconciliation) uses a deterministic algorithm, not AI, to classify items as still-open / newly-resolved / new-tonight. Stage 4 (generation) uses AI but is constrained to only reference events by ID — no free composition.

### 3.2 Grounding Model

Every statement in the handover is produced by prompting Claude with the full event list (IDs included) and requiring output in a structured JSON schema where each handover item must cite one or more `source_event_ids`. Any item with no citations is rejected. The prompt explicitly treats event `description` fields as *data*, not instructions.

### 3.3 Reconciliation Model

A night shift is defined as the 23:00–07:00 window (spanning two calendar dates). For a requested morning date D:

- **Current shift**: events in [D-1 23:00, D 07:00]
- **Historical shifts**: all events before D-1 23:00

An issue is "open" if any historical event is `unresolved` or `pending` AND no subsequent event in any later shift clearly resolves it. Resolution is detected by: (a) explicit `status: resolved` on a linked follow-up event, or (b) AI-assisted semantic matching during the free-text parsing stage (which produces a `resolves_description` field when confident).

### 3.4 Handover Output Sections

1. **URGENT** — Items requiring action before 09:00 (financial, compliance, guest safety)
2. **PENDING** — Open items from previous nights still unresolved
3. **RESOLVED OVERNIGHT** — Issues that closed during the current shift
4. **NEW TONIGHT** — Items that opened and are still open from the current shift
5. **FYI** — Resolved or informational items from the current shift
6. **DATA QUALITY FLAGS** — Contradictions, missing data, or suspicious entries (including prompt injection attempts)

---

## §4 Phasing

| Phase | Scope | Target |
|---|---|---|
| Phase 1 (MVP) | Single hotel, full week ingest, HTML output, deployed | Hour 2 of test |
| Phase 2 | Multi-hotel, hotel_id parameter, caching | Hours 3–4 |
| Phase 3 | Event persistence layer (DB), push delivery (Slack/email) | Post-test |

---

## §5 Functional Requirements

| # | Requirement | Priority |
|---|---|---|
| FR-01 | Ingest structured events from events.json (or POST body) | Must |
| FR-02 | Ingest free-text logs from night-logs.md (or POST body) | Must |
| FR-03 | Normalise free-text to event schema via AI (multilingual) | Must |
| FR-04 | Classify each normalised event as resolved/unresolved/pending | Must |
| FR-05 | Reconcile across shifts: still-open / newly-resolved / new-tonight | Must |
| FR-06 | Generate action-first handover grounded in source event IDs | Must |
| FR-07 | Reject or flag any handover claim with no source citation | Must |
| FR-08 | Detect prompt injection in event descriptions; neutralise + flag | Must |
| FR-09 | Flag contradictory entries (same issue, conflicting resolution) | Must |
| FR-10 | Return handover as HTML (or JSON with HTML field) | Must |
| FR-11 | Expose via REST API; accept hotel_id and date as parameters | Must |
| FR-12 | Structured logs: hotel_id, shift_date, event_id, stage, outcome | Must |
| FR-13 | Handle events with null room or null guest gracefully | Should |
| FR-14 | Detect and surface ambiguous resolutions (uncertain cross-reference) | Should |

---

## §6 Non-Functional Requirements

| # | Requirement |
|---|---|
| NFR-01 | Response time < 15s for one week of data (one hotel) |
| NFR-02 | Deployed publicly; accessible via curl with no auth for test |
| NFR-03 | Handles multilingual input without language-specific hardcoding |
| NFR-04 | Prompt injection must not affect handover output or financial records |
| NFR-05 | Structured logs must be parseable by another AI agent or engineer |
| NFR-06 | Service must generalise to new input it has not seen (no hardcoding) |

---

## §7 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI hallucinates facts | Medium | Critical | Structured output schema with mandatory citation; reject uncited claims |
| Prompt injection succeeds | Low (if unmitigated), High (if mitigated) | Critical | Sanitise all description fields before AI; label as DATA not instructions |
| Free-text parsing misses an event | Medium | High | Flag uncertain extractions; prefer false-positive flags over false-negatives |
| Cross-night matching fails silently | Medium | High | Deterministic reconciliation algorithm (not AI); log all classification decisions |
| Contradictory data both passed through | Medium | Medium | Flag both; let human decide; never silently pick one |
| AI model latency exceeds target | Low | Medium | Timeout with graceful degradation; return partial handover with flag |

---

## §8 Success Criteria

- Morning manager identifies top 3 priorities within 60 seconds of reading the output
- Zero hallucinated facts in the handover (100% of statements trace to a source event ID)
- The prompt injection in evt_0026 is detected and flagged, not executed
- Room 112 AC is classified as "still open" (5-day thread) not "new tonight"
- The immigration passport backlog correctly aggregates across all affected shifts
- The 2nd-floor leak contradiction (free text says unfixed, structured event says resolved) is flagged as a data quality issue

---

## §9 Out of Scope (for this test)

- Real-time event ingestion or webhooks
- Persistent database for event history (MVP reads from files per request)
- Multi-tenant authentication
- Push delivery (Slack, email)
- Dashboard UI beyond the handover HTML
- Capacity planning, rate limiting, or multi-region deployment
