import type { NormalizedEvent, ReconciledEvent, ShiftWindow, ShiftClassification } from "./types";

/**
 * Returns the shift window for a given morning date (YYYY-MM-DD, timezone +08:00).
 * A night shift runs from 23:00 the previous evening to 07:00 the morning date.
 */
export function getShiftWindow(morningDate: string): ShiftWindow {
  const [year, month, day] = morningDate.split("-").map(Number);

  // Previous calendar day at 23:00 +08:00
  const prevDay = new Date(Date.UTC(year, month - 1, day - 1, 15, 0, 0)); // 23:00 +08:00 = 15:00 UTC
  const shiftStart = prevDay.toISOString().replace(".000Z", "+08:00");

  // Same day at 07:00 +08:00
  const thisDay = new Date(Date.UTC(year, month - 1, day, -1, 0, 0)); // 07:00 +08:00 = 23:00 UTC prev day
  // Actually 07:00 +08:00 = 23:00 UTC of (day-1) which is same as above - let me fix
  const shiftEndDate = new Date(Date.UTC(year, month - 1, day, 23, 0, 0)); // 07:00 +08:00 = -1:00 UTC = 23:00 UTC of prev

  // Simpler: use string construction with offset
  const prevDateStr = new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .substring(0, 10);

  const start = `${prevDateStr}T23:00:00+08:00`;
  const end = `${morningDate}T07:00:00+08:00`;

  return { start, end, morningDate };
}

function toMs(isoStr: string): number {
  // Parse ISO 8601 with offset
  return new Date(isoStr).getTime();
}

function isInShift(eventTs: string, window: ShiftWindow): boolean {
  const ts = toMs(eventTs);
  return ts >= toMs(window.start) && ts <= toMs(window.end);
}

function isBeforeShift(eventTs: string, window: ShiftWindow): boolean {
  return toMs(eventTs) < toMs(window.start);
}

/**
 * Determines if eventB is a resolution of eventA by semantic heuristics:
 * - Same room
 * - EventB status is "resolved"
 * - EventB type relates to eventA type
 * - EventB resolvesHint mentions something related
 */
function likelyResolves(candidate: NormalizedEvent, target: NormalizedEvent): boolean {
  if (candidate.status !== "resolved") return false;
  if (candidate.id === target.id) return false;

  // Same room is a strong signal
  const sameRoom = target.room && candidate.room && target.room === candidate.room;

  // resolvesHint from AI parsing contains explicit cross-reference
  if (candidate.resolvesHint) {
    const hint = candidate.resolvesHint.toLowerCase();
    const targetWords = target.description.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const hintMatchesTarget = targetWords.some((w) => hint.includes(w));
    if (hintMatchesTarget) return true;
  }

  // Type-based matching: same type + same room + resolved = likely resolution
  const relatedTypes: Record<string, string[]> = {
    maintenance: ["maintenance", "facilities"],
    facilities: ["facilities", "maintenance"],
    compliance: ["compliance"],
    deposit_issue: ["deposit_issue", "finance_note"],
    finance_note: ["finance_note", "deposit_issue"],
    complaint: ["complaint"],
  };

  const targetTypes = relatedTypes[target.type] || [target.type];
  const typeMatch = targetTypes.includes(candidate.type);

  return Boolean(sameRoom && typeMatch);
}

export function reconcileEvents(
  allEvents: NormalizedEvent[],
  window: ShiftWindow
): ReconciledEvent[] {
  const currentShift = allEvents.filter((e) => isInShift(e.timestamp, window));
  const historicalEvents = allEvents.filter((e) => isBeforeShift(e.timestamp, window));

  // Collect unresolved/pending items from history
  const openFromHistory = historicalEvents.filter(
    (e) => e.status === "unresolved" || e.status === "pending"
  );

  const results: ReconciledEvent[] = [];

  // All events from current shift
  const resolvedInCurrentShift = new Set(
    currentShift.filter((e) => e.status === "resolved").map((e) => e.id)
  );

  // For each historical open item, check if resolved in current shift
  for (const histEvt of openFromHistory) {
    const resolver = currentShift.find((curr) => likelyResolves(curr, histEvt));

    if (resolver) {
      results.push({
        ...histEvt,
        classification: "newly_resolved",
        resolvedByEventId: resolver.id,
      });
    } else {
      results.push({
        ...histEvt,
        classification: "still_open",
      });
    }
  }

  // Current shift events
  for (const evt of currentShift) {
    // Already classified as resolver for a historical item — mark as resolved_same_night
    const isResolverForHistory = results.some((r) => r.resolvedByEventId === evt.id);

    if (evt.status === "resolved") {
      // Check if it resolves something from current shift itself
      const resolvesSameNight = currentShift.find(
        (other) => other.id !== evt.id &&
          (other.status === "unresolved" || other.status === "pending") &&
          likelyResolves(evt, other)
      );

      results.push({
        ...evt,
        classification: isResolverForHistory ? "newly_resolved" : "resolved_same_night",
      });
    } else if (evt.status === "unresolved" || evt.status === "pending") {
      results.push({
        ...evt,
        classification: "new_tonight",
      });
    } else {
      results.push({ ...evt, classification: "fyi" });
    }
  }

  // Historical resolved events (FYI only, don't re-report)
  const resolvedHistory = historicalEvents.filter((e) => e.status === "resolved");
  // We don't include these in the handover — they're ancient history

  return results;
}

export function detectContradictions(events: ReconciledEvent[]): string[] {
  const flags: string[] = [];

  // Contradiction: an item is classified still_open but a current-shift event says it's resolved
  // (catches cases where likelyResolves() missed a match due to heuristic failure)
  const stillOpen = events.filter((e) => e.classification === "still_open");
  const resolvedOvernight = events.filter(
    (e) => e.classification === "resolved_same_night" || e.classification === "newly_resolved"
  );

  for (const open of stillOpen) {
    for (const resolved of resolvedOvernight) {
      if (open.room && open.room === resolved.room && open.type === resolved.type) {
        flags.push(
          `Possible contradiction: ${open.id} (${open.type}, room ${open.room}) marked still-open, but ${resolved.id} in the same room/type was resolved overnight. Manual review recommended.`
        );
      }
    }
  }

  // Contradiction: same event ID appears twice (dedup issue)
  const idCounts = new Map<string, number>();
  for (const e of events) {
    idCounts.set(e.id, (idCounts.get(e.id) || 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      flags.push(`Duplicate event ID detected: ${id} appears ${count} times.`);
    }
  }

  return flags;
}
