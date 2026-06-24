import type { ReconciledEvent, HandoverReport, ShiftWindow } from "./types";
import { callAIService } from "./ai-client";
import { Logger } from "pino";

export async function generateHandover(
  events: ReconciledEvent[],
  contradictions: string[],
  hotel: { id: string; name: string },
  window: ShiftWindow,
  logger: Logger
): Promise<HandoverReport> {
  logger.info(
    { stage: "generate", action: "start", eventCount: events.length },
    "Generating handover"
  );

  const raw = await callAIService<Omit<HandoverReport, "generatedAt">>("/generate-handover", {
    reconciled_events: events,
    contradictions,
    hotel,
    morning_date: window.morningDate,
    shift_window: window,
  });

  const report: HandoverReport = {
    ...raw,
    generatedAt: new Date().toISOString(),
  };

  logger.info(
    {
      stage: "generate",
      action: "complete",
      urgent: report.sections.urgent.length,
      pending: report.sections.pending.length,
      resolvedOvernight: report.sections.resolvedOvernight.length,
      newTonight: report.sections.newTonight.length,
      fyi: report.sections.fyi.length,
      dataQualityFlags: report.sections.dataQualityFlags.length,
    },
    "Handover generation complete"
  );

  return report;
}
