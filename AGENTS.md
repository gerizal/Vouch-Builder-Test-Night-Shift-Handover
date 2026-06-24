# AGENTS.md — AI Agents Used in This Project

This file documents the AI agents and skills from `~/claude-skills/` that were used while building the Night-Shift Handover Service.

## Tool: Claude Code (claude-sonnet-4-6)

Primary AI coding assistant used throughout the build — planning, implementation, debugging, and test writing.

---

## Agent: `cto-architect-advisor`

**Source**: `~/claude-skills/agents/cto-architect-advisor.md`

**When invoked**: Early in the build, before writing implementation code, to stress-test the architecture.

**What it produced**:

A deep technical analysis covering:

- **AI grounding strategy** — three-layer approach: closed-world system prompt (cite everything or drop it), required `citations[]` field in output schema, and a post-generation validator that checks every cited ID exists in the input set.
- **Prompt injection defence** — structural, not lexical. Provenance tagging of guest-authored content before it enters the prompt; XML-style quarantine wrapper with explicit role instructions; output schema with no vocabulary for credits or approvals.
- **Cross-night reconciliation** — deterministic pre-pass by room + type + keyword overlap before any LLM call. Status classification follows a strict `ShiftWindow` boundary function.
- **Contradiction handling** — three cases: apparent conflict (actually temporal sequence), genuine factual conflict (flag as CONTESTED), and stale-open items (age is itself signal). Rule: later timestamp wins on current status, both facts preserved.
- **Structured logging** — four phases (request ingestion, per-event preprocessing, LLM metrics with `prompt_hash`, validation results). PII gated behind TRACE flag in prod.
- **Scale failure modes** — rate limits hit first at 200+ hotels in a 60-minute window. Fix: token-bucket rate limiter + staggered hotel start times hashed from hotel ID.
- **MVP cut list** — essential vs deferrable for a 2-hour window.

**How findings shaped the code**:
- `reconcile.ts` is fully deterministic (no AI calls) — direct result of the "no AI in reconciliation" recommendation.
- `generate.ts` validates every `sourceEventId` against the actual event set before the response leaves the service.
- `sanitize.ts` uses structural data-wrapping (`wrapAsData`) not just keyword matching.
- `createHandoverLogger` child logger captures `hotelId` + `shiftDate` on every log record.

---

## Skill: `create-prd-duc`

**Source**: `~/claude-skills/skills/create-prd-duc/SKILL.md`

**When invoked**: Before writing any code, to define product requirements and design use cases.

**What it produced**:

- `PRD.md` — Product Requirements Document covering problem statement, user personas (morning manager, night agent, ops lead), functional requirements (FR-01 through FR-14), non-functional requirements, risks, and success criteria. Adapted from the ASTRNT PRD format to standalone markdown (no Confluence).
- Structured the six deliverable handover sections: URGENT / PENDING / RESOLVED OVERNIGHT / NEW TONIGHT / FYI / DATA QUALITY FLAGS.
- Identified the prompt injection in `evt_0026` as an explicit test case (FR-08) and a success criterion.

**Adaptation note**: The `create-prd-duc` skill normally creates Jira tickets and Confluence pages in the ASTRNT workspace. For this external project it was used for its document structure and methodology only — output written to local markdown files.

---

## How to invoke these agents on this repo

```bash
# In Claude Code, to get architecture advice:
# "Review the reconcile.ts cross-night algorithm and check for edge cases"
# → Claude Code will use cto-architect-advisor if available

# To re-document a new feature as PRD/DUC:
# "buat PRD untuk fitur X" or "create PRD for feature X"
# → Triggers create-prd-duc skill
```
