import type { NormalizedEvent, RawJsonInput } from "../types";
import { detectPromptInjection } from "./sanitize";

export function ingestJsonEvents(raw: RawJsonInput): NormalizedEvent[] {
  return raw.events.map((evt) => {
    const injectionFlag = detectPromptInjection(evt.description);
    return {
      id: evt.id,
      timestamp: evt.timestamp,
      timestampConfidence: "exact",
      type: evt.type,
      room: evt.room,
      guest: evt.guest,
      description: evt.description,
      originalText: evt.description,
      status: evt.status,
      source: "json",
      promptInjectionFlag: injectionFlag,
    };
  });
}
