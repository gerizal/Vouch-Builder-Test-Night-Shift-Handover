export type EventStatus = "resolved" | "unresolved" | "pending";

export type ShiftClassification = "still_open" | "newly_resolved" | "new_tonight" | "resolved_same_night" | "fyi";

export interface NormalizedEvent {
  id: string;
  timestamp: string; // ISO 8601
  timestampConfidence: "exact" | "estimated" | "unknown";
  type: string;
  room: string | null;
  guest: string | null;
  description: string; // English (translated if needed)
  originalText: string; // raw source text
  status: EventStatus;
  source: "json" | "freetext";
  sourceLine?: number; // for freetext events
  resolvesHint?: string | null; // cross-reference hint from AI parsing
  promptInjectionFlag?: boolean;
}

export interface ShiftWindow {
  start: string; // ISO 8601 (23:00 of the evening date)
  end: string;   // ISO 8601 (07:00 of the morning date)
  morningDate: string; // YYYY-MM-DD
}

export interface ReconciledEvent extends NormalizedEvent {
  classification: ShiftClassification;
  resolvedByEventId?: string; // if newly_resolved, which event resolved it
}

export interface HandoverItem {
  title: string;
  detail: string;
  actionRequired: string | null;
  sourceEventIds: string[];
  dataQualityFlag: string | null;
}

export interface HandoverReport {
  hotel: {
    id: string;
    name: string;
  };
  morningDate: string;
  generatedAt: string;
  shiftWindow: ShiftWindow;
  sections: {
    urgent: HandoverItem[];
    pending: HandoverItem[];
    resolvedOvernight: HandoverItem[];
    newTonight: HandoverItem[];
    fyi: HandoverItem[];
    dataQualityFlags: HandoverItem[];
  };
  generationMeta: {
    eventsIngested: number;
    freetextEventsParsed: number;
    promptInjectionDetected: boolean;
    contradictionsFound: number;
  };
}

export interface HotelConfig {
  id: string;
  name: string;
  timezone: string;
}

export interface RawJsonInput {
  hotel: HotelConfig;
  events: Array<{
    id: string;
    timestamp: string;
    type: string;
    room: string | null;
    guest: string | null;
    description: string;
    status: EventStatus;
  }>;
}
