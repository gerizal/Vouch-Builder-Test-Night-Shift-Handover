from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

from extractor import parse_freetext
from generator import generate_handover

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ai_service")

app = FastAPI(title="Vouch AI Service", description="Rule-based NLP for hotel handover generation")


class FreetextRequest(BaseModel):
    text: str
    shift_date: str  # YYYY-MM-DD


class HandoverRequest(BaseModel):
    reconciled_events: list[dict]
    contradictions: list[str]
    hotel: dict
    morning_date: str
    shift_window: dict


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse-freetext")
def parse_freetext_endpoint(req: FreetextRequest):
    log.info(f"parse-freetext shift_date={req.shift_date} text_len={len(req.text)}")
    try:
        events = parse_freetext(req.text, req.shift_date)
        log.info(f"parse-freetext extracted {len(events)} events")
        return events
    except Exception as e:
        log.error(f"parse-freetext failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-handover")
def generate_handover_endpoint(req: HandoverRequest):
    log.info(f"generate-handover hotel={req.hotel.get('id')} date={req.morning_date} events={len(req.reconciled_events)}")
    try:
        report = generate_handover(
            req.reconciled_events,
            req.contradictions,
            req.hotel,
            req.morning_date,
            req.shift_window,
        )
        log.info(
            f"generate-handover complete urgent={len(report['sections']['urgent'])} "
            f"pending={len(report['sections']['pending'])} "
            f"injection={report['generationMeta']['promptInjectionDetected']}"
        )
        return report
    except Exception as e:
        log.error(f"generate-handover failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
