"""
Rule-based free-text event extractor.

Takes a block of hotel night-log prose (any language) and returns a list of
structured NormalizedEvent dicts. Language detection + translation handles
multilingual input; regex + keyword matching handles extraction.
"""

import re
from typing import Optional
from translator import translate_to_english

# --- Room number patterns ---
ROOM_RE = re.compile(
    r"\broom\s+(\d{2,4})\b"
    r"|(?<!\d)(\d{3,4})(?:房|\s*房間|\s*room)?"  # 3–4 digit standalone or followed by 房
    r"|\b(\d{3,4})\b",
    re.IGNORECASE,
)

# --- Time patterns ---
TIME_RE = re.compile(
    r"\b(\d{1,2}:\d{2})\s*(am|pm)?\b"
    r"|\b(\d{1,2})\s*(am|pm)\b"
    r"|\baround\s+(\d{1,2})\b",
    re.IGNORECASE,
)

# --- Event type keyword map (checked in priority order) ---
TYPE_KEYWORDS: list[tuple[str, list[str]]] = [
    ("incident",        ["unwell", "sick", "ambulance", "medication", "fell", "injury", "hurt", "fainted"]),
    ("compliance",      ["passport", "immigration", "scan", "submit", "reporting", "immigration system", "护照", "签证"]),
    ("deposit_issue",   ["deposit", "card declined", "card was declined", "payment declined", "no deposit", "押金", "收费"]),
    ("damage_report",   ["damage", "cracked", "broken fixture", "smashed", "dent", "损坏"]),
    ("no_show",         ["no-show", "no show", "did not arrive", "did not check in", "never showed"]),
    ("early_checkout_request", ["early checkout", "early check-out", "leaving early", "departing early", "退房赶飞机", "早退"]),
    ("finance_note",    ["charge", "billing", "invoice", "no-show fee", "goodwill", "refund", "credited", "收了"]),
    ("maintenance",     ["aircon", "ac ", " ac,", " ac.", "air con", "air conditioning", "leak", "leaking",
                         "broken", "repair", "out of order", "compressor", "safe", "safebox",
                         "safe box", "locked", "wifi", "wi-fi", "door", "保险箱", "维修", "修", "坏了"]),
    ("facilities",      ["water leak", "flood", "wet floor", "drip", "bucket", "corridor"]),
    ("complaint",       ["noise", "complaint", "complain", "disturb", "loud", "angry", "unhappy", "upset", "angry about"]),
    ("check_in",        ["check-in", "check in", "checked in", "late arrival", "keycard", "key card", "入住", "办理入住"]),
    ("early_checkout_request", ["check-out", "checkout", "departure", "checking out", "退房", "出发"]),
    ("walk_in",         ["walk-in", "walk in", "no reservation", "no booking", "wanted a room"]),
    ("note",            ["parcel", "package", "message", "left a note", "holding"]),
]

RESOLVED_SIGNALS = [
    "resolved", "fixed", "settled", "done", "sorted", "closed", "handled",
    "all fine", "no issue", "all good", "complete", "finished", "okay now",
    "taken care", "ok now", "it sorted", "they sorted", "assume it",
    "settle了", "解决", "好了", "完成", "没问题", "settle 了",
]

UNRESOLVED_SIGNALS = [
    "needs", "need to", "pending", "still", "follow-up", "follow up",
    "not yet", "outstanding", "chase", "unresolved", "please", "passing it on",
    "action required", "to do", "check", "verify", "confirm", "review",
    "couldn't", "could not", "no one came", "not fixed", "not resolved",
    "needs investigation", "hasn't", "has not",
    "需要", "尽快", "还没", "问题", "走不了", "打不开",
]

INJECTION_RE = re.compile(
    r"system\s+note\s+to|ignore\s+(all|other|previous|above)"
    r"|report\s+the\s+night\s+as|add\s+a?\s+(credit|charge|refund)\s+to\s+room"
    r"|mark\s+it\s+approved|disregard\s+(all|previous)",
    re.IGNORECASE,
)


def _extract_room(text: str) -> Optional[str]:
    """Return the first plausible room number found in the text."""
    for m in ROOM_RE.finditer(text):
        num = m.group(1) or m.group(2) or m.group(3)
        if num and 100 <= int(num) <= 9999:
            return num
    return None


def _classify_type(text: str) -> str:
    lower = text.lower()
    for event_type, keywords in TYPE_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return event_type
    return "note"


def _classify_status(text: str) -> str:
    lower = text.lower()
    resolved_score = sum(1 for s in RESOLVED_SIGNALS if s in lower)
    unresolved_score = sum(1 for s in UNRESOLVED_SIGNALS if s in lower)
    if resolved_score > unresolved_score:
        return "resolved"
    if unresolved_score > 0:
        return "unresolved"
    return "pending"


def _estimate_timestamp(line_text: str, shift_date: str) -> tuple[str, str]:
    """
    Returns (ISO timestamp string, confidence).
    shift_date is YYYY-MM-DD of the morning (end of shift).
    Evening date is shift_date minus 1 day.
    """
    from datetime import date, timedelta
    morning = date.fromisoformat(shift_date)
    evening = morning - timedelta(days=1)

    m = TIME_RE.search(line_text)
    if m:
        raw = m.group(1) or f"{m.group(3) or m.group(5)}:00"
        ampm = (m.group(2) or m.group(4) or "").lower()
        try:
            parts = raw.split(":")
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0
            if ampm == "pm" and hour < 12:
                hour += 12
            elif ampm == "am" and hour == 12:
                hour = 0
            # Before 7am → morning date; 23:00+ → evening date
            cal_date = morning if hour < 7 else evening
            ts = f"{cal_date.isoformat()}T{hour:02d}:{minute:02d}:00+08:00"
            return ts, "estimated"
        except ValueError:
            pass

    # No time found — put at midnight of evening date
    return f"{evening.isoformat()}T00:00:00+08:00", "unknown"


def _detect_resolves_hint(text: str, event_type: str) -> Optional[str]:
    """If this event seems to resolve a prior issue, describe what."""
    lower = text.lower()
    if any(s in lower for s in ["resolved", "fixed", "settled", "done", "no longer"]):
        if event_type in ("maintenance", "facilities"):
            return f"may resolve a prior open {event_type} issue in the same location"
        if event_type in ("finance_note", "deposit_issue"):
            return f"may settle a prior open financial issue for this guest/room"
    return None


def parse_freetext(markdown_text: str, shift_date: str) -> list[dict]:
    """
    Extract structured events from a free-text night log.
    Returns a list of event dicts matching NormalizedEvent shape.
    """
    # Split into bullet points / paragraphs
    lines = [ln.strip() for ln in markdown_text.splitlines()]
    segments: list[tuple[int, str]] = []  # (line_number, text)

    buffer: list[str] = []
    start_line = 0
    for i, line in enumerate(lines):
        if line.startswith("-") or line.startswith("•") or line.startswith("*"):
            if buffer:
                segments.append((start_line, " ".join(buffer)))
            buffer = [line.lstrip("-•* ")]
            start_line = i + 1
        elif line and buffer:
            buffer.append(line)
        elif not line and buffer:
            segments.append((start_line, " ".join(buffer)))
            buffer = []
            start_line = i + 1

    if buffer:
        segments.append((start_line, " ".join(buffer)))

    # If no bullet points found, treat each non-empty paragraph as a segment
    if not segments:
        para: list[str] = []
        line_no = 0
        for i, line in enumerate(lines):
            if line:
                if not para:
                    line_no = i + 1
                para.append(line)
            elif para:
                segments.append((line_no, " ".join(para)))
                para = []
        if para:
            segments.append((line_no, " ".join(para)))

    events: list[dict] = []
    for idx, (line_no, raw_text) in enumerate(segments):
        if len(raw_text) < 10:
            continue  # Skip trivial lines

        # Translate to English
        english_text, source_lang = translate_to_english(raw_text)

        room = _extract_room(english_text) or _extract_room(raw_text)
        event_type = _classify_type(english_text)
        status = _classify_status(english_text)
        timestamp, confidence = _estimate_timestamp(english_text, shift_date)
        resolves_hint = _detect_resolves_hint(english_text, event_type)
        injection_flag = bool(INJECTION_RE.search(english_text))

        event = {
            "id": f"nl_{idx + 1:03d}",
            "timestamp": timestamp,
            "timestampConfidence": confidence,
            "type": event_type,
            "room": room,
            "guest": None,
            "descriptionEnglish": english_text,
            "originalText": raw_text,
            "status": status,
            "resolvesHint": resolves_hint,
            "sourceLine": line_no,
            "sourceLang": source_lang,
            "promptInjectionFlag": injection_flag,
        }
        events.append(event)

    return events
