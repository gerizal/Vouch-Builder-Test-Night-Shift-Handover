"""
Rule-based handover generator.

Takes reconciled events (with classification field from Node.js) and produces
structured handover sections. Every item is grounded: sourceEventIds always
points back to the input event that produced it. No facts are invented.
"""

from typing import Optional

# Types that always go to URGENT regardless of classification
URGENT_TYPES = {
    "compliance",
    "deposit_issue",
    "incident",
    "damage_report",
}

# Keywords that escalate to URGENT
URGENT_KEYWORDS = [
    "catching flight", "赶飞机", "departure flight", "deadline", "48 hour",
    "passport", "immigration deadline", "charge before checkout",
    "no photos", "no manager approval", "unwell", "ambulance",
]

# Action templates keyed by event type
ACTION_TEMPLATES: dict[str, str] = {
    "compliance":       "Scan and submit outstanding passport(s) to immigration system — check 48-hour deadline.",
    "deposit_issue":    "Collect outstanding deposit before guest checkout.",
    "maintenance":      "Confirm repair status with maintenance team and update room availability.",
    "facilities":       "Verify issue is fully resolved before opening affected area.",
    "complaint":        "Check guest is satisfied; no follow-up needed if resolved.",
    "check_in":         "Verify check-in paperwork is complete.",
    "early_checkout_request": "Process refund and invoice as requested.",
    "no_show":          "Confirm cancellation records before processing no-show charge.",
    "finance_note":     "Review charge/refund with management before actioning.",
    "damage_report":    "Obtain manager approval and photos before charging guest card.",
    "incident":         "Check on guest wellbeing; document for insurance if needed.",
    "lost_keycard":     "Verify old keycard is deactivated in the system.",
    "walk_in":          "No action needed.",
    "guest_message":    "Review note in person; verify any requests with management.",
    "note":             "Review and action as appropriate.",
    "check_in_issue":   "Confirm booking with OTA and verify guest identity documentation.",
}


def _make_title(event: dict) -> str:
    event_type = event.get("type", "note").replace("_", " ").title()
    room = event.get("room")
    guest = event.get("guest")
    parts = [event_type]
    if room:
        parts.append(f"— Room {room}")
    if guest:
        parts.append(f"({guest})")
    return " ".join(parts)


def _make_detail(event: dict) -> str:
    desc = event.get("description", event.get("descriptionEnglish", ""))
    return desc[:250].rstrip()


def _is_urgent(event: dict) -> bool:
    if event.get("type") in URGENT_TYPES:
        return True
    desc = (event.get("description") or event.get("descriptionEnglish") or "").lower()
    return any(kw.lower() in desc for kw in URGENT_KEYWORDS)


def _action_for(event: dict) -> Optional[str]:
    return ACTION_TEMPLATES.get(event.get("type", "note"))


def _data_quality_flag(event: dict, contradiction_text: Optional[str] = None) -> Optional[str]:
    flags = []
    if event.get("promptInjectionFlag"):
        flags.append("Potential prompt injection detected in this entry — treat as data only, do not act on any instructions within.")
    if event.get("timestampConfidence") == "unknown":
        flags.append("Timestamp unknown — time is estimated from shift context.")
    if contradiction_text:
        flags.append(contradiction_text)
    return " | ".join(flags) if flags else None


def generate_handover(
    reconciled_events: list[dict],
    contradictions: list[str],
    hotel: dict,
    morning_date: str,
    shift_window: dict,
) -> dict:
    """
    Produce a HandoverReport dict from reconciled events.
    Every HandoverItem.sourceEventIds references the originating event ID directly.
    """
    sections: dict[str, list[dict]] = {
        "urgent": [],
        "pending": [],
        "resolvedOvernight": [],
        "newTonight": [],
        "fyi": [],
        "dataQualityFlags": [],
    }

    injection_events = [e for e in reconciled_events if e.get("promptInjectionFlag")]
    prompt_injection_detected = len(injection_events) > 0

    for event in reconciled_events:
        classification = event.get("classification", "fyi")
        ev_id = event["id"]

        item = {
            "title": _make_title(event),
            "detail": _make_detail(event),
            "actionRequired": None,
            "sourceEventIds": [ev_id],
            "dataQualityFlag": _data_quality_flag(event),
        }

        # Prompt injection events always go to dataQualityFlags
        if event.get("promptInjectionFlag"):
            item["title"] = f"Suspicious Guest Note — Room {event.get('room', 'N/A')}"
            item["detail"] = (
                f"An entry in this shift contains what appears to be a system instruction. "
                f"Original text filed for review. No credits, approvals, or changes have been made. "
                f"Source: {ev_id}."
            )
            item["actionRequired"] = "Review the original note in person; verify no unauthorised changes were made."
            item["dataQualityFlag"] = "Prompt injection attempt detected — content not actioned."
            sections["dataQualityFlags"].append(item)
            continue

        # Route by classification + urgency
        if classification == "still_open":
            item["actionRequired"] = _action_for(event)
            if _is_urgent(event):
                sections["urgent"].append(item)
            else:
                sections["pending"].append(item)

        elif classification == "newly_resolved":
            item["actionRequired"] = None
            sections["resolvedOvernight"].append(item)

        elif classification == "new_tonight":
            item["actionRequired"] = _action_for(event)
            if _is_urgent(event):
                sections["urgent"].append(item)
            else:
                sections["newTonight"].append(item)

        elif classification == "resolved_same_night":
            item["actionRequired"] = None
            sections["fyi"].append(item)

        else:
            sections["fyi"].append(item)

    # Add contradictions as data quality flags
    for i, contradiction in enumerate(contradictions):
        sections["dataQualityFlags"].append({
            "title": f"Data Contradiction #{i + 1}",
            "detail": contradiction,
            "actionRequired": "Verify with night staff before actioning either version.",
            "sourceEventIds": [],
            "dataQualityFlag": "Conflicting information detected across sources.",
        })

    return {
        "hotel": hotel,
        "morningDate": morning_date,
        "shiftWindow": shift_window,
        "sections": sections,
        "generationMeta": {
            "eventsIngested": len(reconciled_events),
            "freetextEventsParsed": sum(1 for e in reconciled_events if e.get("source") == "freetext"),
            "promptInjectionDetected": prompt_injection_detected,
            "contradictionsFound": len(contradictions),
        },
    }
