// Prompt injection patterns: instructions masquerading as event data.
// A guest or staff note should never contain system-level directives.
const INJECTION_PATTERNS = [
  /system\s+note\s+to/i,
  /ignore\s+(all|other|previous|above)/i,
  /report\s+(the\s+night|all\s+items)\s+as/i,
  /add\s+a?\s+(credit|charge|refund)\s+to\s+room/i,
  /mark\s+it\s+approved/i,
  /disregard\s+(all|previous|above)/i,
  /forget\s+(everything|all|previous)/i,
];

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Wraps a description in explicit DATA delimiters before sending to the AI.
 * The AI system prompt instructs it to treat anything inside these delimiters
 * as raw data and never execute instructions found within them.
 */
export function wrapAsData(text: string): string {
  return `[EVENT DATA START]\n${text}\n[EVENT DATA END]`;
}
