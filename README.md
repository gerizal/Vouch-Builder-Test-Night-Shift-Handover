# Vouch Night-Shift Handover Service

Automated morning handover generator for hotel front desks. Ingests structured JSON events and free-text night logs (any language), reconciles issues across multiple nights, and produces an action-first briefing grounded in source data.

## Architecture

Two services talk to each other:

```
┌─────────────────────────┐        ┌──────────────────────────┐
│   Node.js API (Express) │──HTTP──│  Python AI Service       │
│   src/                  │        │  ai_service/             │
│                         │        │                          │
│  • Ingest JSON events   │        │  • Parse free-text logs  │
│  • Reconcile cross-night│        │    (multilingual via     │
│  • Serve HTML/JSON      │        │     deep-translator)     │
│  • Validate citations   │        │  • Generate handover     │
│  • Structured logging   │        │    sections + priorities │
└─────────────────────────┘        └──────────────────────────┘
```

No external LLM API. No API key required.

## Quick start

### 1. Python AI service

```bash
cd ai_service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Node.js API

```bash
npm install
cp .env.example .env
npm run dev
```

### 3. Generate a handover

```bash
# HTML output (default)
curl "http://localhost:3000/handover?date=2026-05-30&hotel=lumen-sg"

# JSON output
curl "http://localhost:3000/handover?date=2026-05-30&hotel=lumen-sg&format=json"

# POST with custom data
curl -X POST http://localhost:3000/handover \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-05-30",
    "hotel": "lumen-sg",
    "nightLogText": "Room 301 guest complained about noise from 302. Called 302, resolved."
  }'
```

## Deployed endpoints

```bash
# API (Node.js)
curl "https://distinguished-youthfulness-production-3b23.up.railway.app/handover?date=2026-05-30&hotel=lumen-sg"

# AI service health
curl "https://ai-service-production-abac.up.railway.app/health"
```

## Environment variables

**Node.js service (`.env`):**

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `AI_SERVICE_URL` | `http://localhost:8000` | Python AI service URL |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `NODE_ENV` | `development` | Set to `production` for JSON logs |

**Python service:** No environment variables required.

## API reference

### `GET /handover`

| Param | Required | Description |
|---|---|---|
| `date` | Yes | Morning date `YYYY-MM-DD` |
| `hotel` | No | Hotel ID (default: reads from `data/events.json`) |
| `format` | No | `html` (default) or `json` |

### `POST /handover`

```json
{
  "date": "2026-05-30",
  "hotel": "lumen-sg",
  "eventsJson": { ... },     // optional — overrides data/events.json
  "nightLogText": "..."      // optional — overrides data/night-logs.md
}
```

### `GET /health`

Returns `{ "status": "ok" }`.

## Handover output sections

| Section | Contents |
|---|---|
| **URGENT** | Action required before 09:00 (compliance, deposits, safety) |
| **PENDING** | Open items carried from previous nights |
| **RESOLVED OVERNIGHT** | Issues that closed during this shift |
| **NEW TONIGHT** | Opened this shift, still unresolved |
| **FYI** | Resolved or informational from this shift |
| **DATA QUALITY FLAGS** | Contradictions, suspicious entries, prompt injection attempts |

Every item shows its source event ID(s). No statement appears without a citation.

## Running tests

```bash
npm test                 # 59 unit + E2E tests (AI service mocked)
npm run test:coverage    # with coverage report
```

## Railway deployment

Deploy as two separate Railway services:

**Python AI service:**
- Root directory: `ai_service/`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**Node.js API:**
- Root directory: `/`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment: `AI_SERVICE_URL=https://ai-service-production-abac.up.railway.app`

## Project structure

```
src/                    Node.js API
  index.ts              Express server
  types.ts              Shared TypeScript types
  logger.ts             pino structured logger
  ai-client.ts          HTTP client for Python AI service
  ingest/
    json.ts             Parse events.json
    markdown.ts         Call Python /parse-freetext
    sanitize.ts         Prompt injection detection
  reconcile.ts          Cross-night classification (deterministic)
  generate.ts           Call Python /generate-handover
  render.ts             HTML renderer

ai_service/             Python AI service
  main.py               FastAPI app
  extractor.py          Rule-based free-text event extraction
  translator.py         Language detection + translation
  generator.py          Template-based handover generation
  requirements.txt

tests/
  unit/                 sanitize, ingest-json, reconcile, render
  e2e/                  API endpoint tests (fetch mocked)
  fixtures/             Shared test data

data/
  events.json           Sample structured events (1 hotel, 1 week)
  night-logs.md         Sample free-text log (multilingual)
```
