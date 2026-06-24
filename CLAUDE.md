# CLAUDE.md — Night-Shift Handover Service

Project-level instructions for Claude Code and other AI coding tools working in this repository.

---

## Project Overview

Automated night-shift handover generator for hotel front desks. Ingests structured JSON events and free-text night logs (any language), reconciles issues across multiple nights, generates an action-first morning briefing grounded strictly in source data.

**Stack**: Node.js · TypeScript · Express · Python FastAPI (AI sidecar) · pino · Vitest

---

## Agents

Agents live in `.claude/agents/`. Load the right one before starting a task.

### `cto-architect-advisor`

**Trigger when:**
- Designing or reviewing system architecture (pipeline stages, service boundaries, data flow)
- Evaluating tradeoffs between approaches (e.g. deterministic vs AI-based reconciliation)
- Assessing scalability — multi-hotel, rate limits, concurrent processing
- Writing or reviewing `DECISIONS.md`
- Any question starting with "should we…", "what's the risk of…", or "how would this scale to…"

**Examples:**
```
Review the cross-night reconciliation algorithm in reconcile.ts for edge cases at scale
Should we add a database layer for event persistence or keep reading from files?
What breaks first if we run this for 200 hotels at 07:00 simultaneously?
```

### `EngineerAgent`

**Trigger when:**
- Writing or refactoring TypeScript services (`ingest/`, `reconcile.ts`, `generate.ts`)
- Adding a new Express route or middleware
- Reviewing code for SOLID violations, N+1 issues, or missing error handling
- Writing test cases in Vitest

**Examples:**
```
Add a POST /handover route that accepts raw event arrays in the body
Review generate.ts for any business logic leaking into the controller
Write unit tests for the new deduplication logic in reconcile.ts
```

---

## Skills

Skills live in `.claude/skills/`. Invoke them with `/skill-name` or describe the trigger.

### `create-prd-duc`

**Trigger when:**
- Creating or updating a PRD or DUC (`create PRD`, `buat PRD`, `create DUC`, `buat DUC`)
- Documenting a new feature or convention before implementation begins
- Adding a new handover section type or changing the output format

**Note**: This project is standalone (no Confluence/Jira). Output goes to local markdown files: `PRD.md` and `DUC.md`.

**Examples:**
```
/create-prd-duc
Buat PRD untuk fitur multi-hotel support
Create a DUC for the new Slack delivery output format
```

---

## Non-negotiable rules (enforce in every edit)

### 1. Grounding — zero hallucination policy
Every `HandoverItem` in `generate.ts` must have a non-empty `sourceEventIds[]` that references real event IDs from the input. The `validateItems()` function **must drop** any item where all cited IDs are absent from the event set. Never pass uncited claims through to the response.

### 2. Prompt injection defence
All event `description` fields are wrapped in `[EVENT DATA START] … [EVENT DATA END]` delimiters in `sanitize.ts`. `detectPromptInjection()` must run on every event description — including those extracted from free-text logs. Flagged events are routed to `dataQualityFlags` in the Python generator and never appear in the main handover sections.

### 3. No AI in reconciliation
`reconcile.ts` is deterministic — no LLM calls. Classification (still_open / newly_resolved / new_tonight) must be reproducible across runs without model inference. If you need AI to assist matching, do it in the **ingest** stage (producing a `resolvesHint` field), not the reconcile stage.

### 4. Structured logging
Every log call goes through `createHandoverLogger(hotelId, shiftDate)` — never `console.log`. Every log record must include `stage` and `action` fields so a support engineer (or AI agent) can trace a bad handover by hotel and date.

### 5. Slim controllers
`src/index.ts` only parses input, calls services, and returns responses. Business logic stays in `ingest/`, `reconcile.ts`, `generate.ts`. No DB queries, AI calls, or classification logic in route handlers.

---

## Project Structure

```
src/
  index.ts            Express server + route handlers (slim controllers only)
  types.ts            Shared TypeScript interfaces
  logger.ts           pino child logger factory
  ingest/
    json.ts           Parse events.json → NormalizedEvent[]
    markdown.ts       Parse free-text log via Claude (multilingual)
    sanitize.ts       Prompt injection detection + [EVENT DATA] wrapping
  reconcile.ts        Deterministic cross-night classification
  generate.ts         AI handover generation + citation validation
  render.ts           HTML renderer
tests/
  unit/               sanitize, ingest-json, reconcile, render
  e2e/                API endpoint tests (Anthropic mocked)
  fixtures/           Shared test data
data/
  events.json         Structured front-desk events
  night-logs.md       Free-text log (may contain non-English)
.claude/
  agents/             cto-architect-advisor, EngineerAgent
  skills/             create-prd-duc, be-db-engineer
```

## Commands

```bash
npm run dev           # tsx watch — hot reload
npm run build         # tsc → dist/
npm start             # run dist/index.js
npm test              # vitest run (no real API calls)
npm run test:watch    # vitest watch
npm run test:coverage # coverage report
```

## Environment

```
PORT=3000                       optional, default 3000
AI_SERVICE_URL=http://localhost:8000   URL of the Python AI sidecar
LOG_LEVEL=info                  optional: debug | info | warn | error
NODE_ENV=production             disables pino-pretty
```
