import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import logger, { createHandoverLogger } from "./logger";
import { ingestJsonEvents } from "./ingest/json";
import { ingestMarkdownLog } from "./ingest/markdown";
import { getShiftWindow, reconcileEvents, detectContradictions } from "./reconcile";
import { generateHandover } from "./generate";
import { renderHtml } from "./render";
import type { RawJsonInput } from "./types";

const app = express();
app.use(express.json({ limit: "2mb" }));

const DATA_DIR = path.join(__dirname, "..", "data");

/**
 * GET /handover?date=YYYY-MM-DD&hotel=lumen-sg&format=html|json
 * POST /handover  body: { date, hotel, eventsJson?, nightLogText? }
 *
 * Generates a morning handover report for the given hotel and date.
 */
async function handleHandover(req: Request, res: Response) {
  const date = (req.query.date || (req.body && req.body.date)) as string | undefined;
  const hotelParam = (req.query.hotel || (req.body && req.body.hotel)) as string | undefined;
  const format = ((req.query.format || "html") as string).toLowerCase();

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date parameter required (YYYY-MM-DD)" });
    return;
  }

  const handoverLogger = createHandoverLogger(hotelParam || "unknown", date);
  handoverLogger.info({ action: "request_start", method: req.method }, "Handover request received");

  try {
    // Load events.json — from POST body or from file
    let rawJson: RawJsonInput;
    if (req.body && req.body.eventsJson) {
      rawJson = typeof req.body.eventsJson === "string"
        ? JSON.parse(req.body.eventsJson)
        : req.body.eventsJson;
    } else {
      const jsonPath = path.join(DATA_DIR, "events.json");
      if (!fs.existsSync(jsonPath)) {
        res.status(404).json({ error: "events.json not found and no eventsJson provided" });
        return;
      }
      rawJson = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    }

    // Load night-logs.md — from POST body or from file
    let nightLogText = "";
    if (req.body && req.body.nightLogText) {
      nightLogText = req.body.nightLogText;
    } else {
      const mdPath = path.join(DATA_DIR, "night-logs.md");
      if (fs.existsSync(mdPath)) {
        nightLogText = fs.readFileSync(mdPath, "utf-8");
      }
    }

    const hotel = { id: rawJson.hotel.id, name: rawJson.hotel.name };
    const window = getShiftWindow(date);

    handoverLogger.info(
      { action: "shift_window", start: window.start, end: window.end },
      "Shift window calculated"
    );

    // Ingest structured events
    const structuredEvents = ingestJsonEvents(rawJson);
    handoverLogger.info(
      { action: "ingest_json", count: structuredEvents.length },
      "Structured events ingested"
    );

    // Ingest free-text log if present
    let freetextEvents: Awaited<ReturnType<typeof ingestMarkdownLog>> = [];
    if (nightLogText.trim()) {
      freetextEvents = await ingestMarkdownLog(nightLogText, date, handoverLogger);
    }

    // Merge all events
    const allEvents = [...structuredEvents, ...freetextEvents];

    // Reconcile across nights
    const reconciledEvents = reconcileEvents(allEvents, window);
    const contradictions = detectContradictions(reconciledEvents);

    handoverLogger.info(
      {
        action: "reconcile_complete",
        total: reconciledEvents.length,
        stillOpen: reconciledEvents.filter((e) => e.classification === "still_open").length,
        newlyResolved: reconciledEvents.filter((e) => e.classification === "newly_resolved").length,
        newTonight: reconciledEvents.filter((e) => e.classification === "new_tonight").length,
        contradictions: contradictions.length,
      },
      "Reconciliation complete"
    );

    // Generate handover
    const report = await generateHandover(reconciledEvents, contradictions, hotel, window, handoverLogger);

    handoverLogger.info({ action: "request_complete" }, "Handover delivered");

    if (format === "json") {
      res.json(report);
    } else {
      const html = renderHtml(report);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    }
  } catch (err) {
    handoverLogger.error(
      { action: "request_failed", error: String(err) },
      "Handover generation failed"
    );
    res.status(500).json({ error: "Handover generation failed", detail: String(err) });
  }
}

app.get("/handover", handleHandover);
app.post("/handover", handleHandover);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (_req, res) => {
  res.json({
    service: "Vouch Night-Shift Handover Service",
    endpoints: {
      "GET /handover": "?date=YYYY-MM-DD&hotel=lumen-sg&format=html|json",
      "POST /handover": "body: { date, hotel, eventsJson?, nightLogText? }",
      "GET /health": "health check",
    },
    example: "/handover?date=2026-05-30&hotel=lumen-sg",
  });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  logger.info({ action: "server_start", port: PORT }, `Handover service listening on :${PORT}`);
});
