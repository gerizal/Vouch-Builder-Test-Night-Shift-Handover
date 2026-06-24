import type { NormalizedEvent } from "../types";
import { detectPromptInjection } from "./sanitize";
import { callAIService } from "../ai-client";
import { Logger } from "pino";

interface ParsedFreetextEvent {
  id: string;
  timestamp: string;
  timestampConfidence: "exact" | "estimated" | "unknown";
  type: string;
  room: string | null;
  guest: string | null;
  descriptionEnglish: string;
  originalText: string;
  status: "resolved" | "unresolved" | "pending";
  resolvesHint: string | null;
  sourceLine: number;
  sourceLang: string;
  promptInjectionFlag: boolean;
}

export async function ingestMarkdownLog(
  markdownText: string,
  shiftDate: string,
  logger: Logger
): Promise<NormalizedEvent[]> {
  logger.info({ stage: "freetext_parse", action: "start" }, "Parsing free-text night log");

  const parsed = await callAIService<ParsedFreetextEvent[]>("/parse-freetext", {
    text: markdownText,
    shift_date: shiftDate,
  });

  logger.info(
    { stage: "freetext_parse", action: "complete", eventsExtracted: parsed.length },
    "Free-text parse complete"
  );

  return parsed.map((evt) => {
    const injectionFlag =
      evt.promptInjectionFlag ||
      detectPromptInjection(evt.descriptionEnglish) ||
      detectPromptInjection(evt.originalText);

    return {
      id: evt.id,
      timestamp: evt.timestamp,
      timestampConfidence: evt.timestampConfidence,
      type: evt.type,
      room: evt.room,
      guest: evt.guest,
      description: evt.descriptionEnglish,
      originalText: evt.originalText,
      status: evt.status,
      source: "freetext" as const,
      sourceLine: evt.sourceLine,
      resolvesHint: evt.resolvesHint,
      promptInjectionFlag: injectionFlag,
    };
  });
}
