from __future__ import annotations

"""
Dempster-Shafer Evidence Fusion Module

Fuses evidence from multiple maritime surveillance sources using Dempster-Shafer
theory to produce a combined threat belief for a given vessel (MMSI).

This module exposes a FastAPI APIRouter. Integrate by importing `router` in main.py.

Callback injection (set these before use):
    fusion._get_dark_event = my_dark_event_fn
    fusion._get_aircraft_proximity = my_adsb_fn
    etc.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level callbacks — injected by main.py
# ---------------------------------------------------------------------------

_get_dark_event = None        # (mmsi: int) -> dict|None  {duration_hours, dark_start, dark_end}
_get_aircraft_proximity = None  # (mmsi: int) -> list[dict]  nearby aircraft
_get_sanctions = None          # (mmsi: int) -> dict  {is_flagged, sanctions_hits}
_get_weather = None            # () -> dict  {stations: [...], sea_state: float, ...}
_get_overpasses = None         # () -> list[dict]  overpass records
_get_intent = None             # (mmsi: int) -> dict  {classification, confidence}
_get_triage = None             # () -> list[dict]  [{mmsi, threat_score, ...}]
_get_vessel_info = None        # (mmsi: int) -> dict|None  {name, vessel_type, last_position}

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/fusion", tags=["fusion"])

# ---------------------------------------------------------------------------
# Pydantic response schema
# ---------------------------------------------------------------------------


class EvidenceSource(BaseModel):
    type: str
    status: str
    confidence: float
    detail: str
    timestamp: str


class FusionResponse(BaseModel):
    mmsi: int
    vessel_name: str
    sources: List[EvidenceSource]
    fused_threat_belief: float
    fused_safe_belief: float
    fused_uncertainty: float
    fusion_method: str
    recommendation: str
    next_overpass_utc: Optional[str]
    weather_impact: Optional[str]


# ---------------------------------------------------------------------------
# Dempster-Shafer helpers
# ---------------------------------------------------------------------------

MassFn = Dict[str, float]  # keys: "threat", "safe", "uncertain"


def _uniform_prior() -> MassFn:
    """Vacuous/uninformative prior — full uncertainty."""
    return {"threat": 0.0, "safe": 0.0, "uncertain": 1.0}


def ds_combine(m1: MassFn, m2: MassFn) -> MassFn:
    """
    Dempster's rule of combination for two mass functions over
    the frame {threat, safe, uncertain}.

    Focal element intersections:
        threat   ∩ threat    = threat
        threat   ∩ uncertain = threat
        uncertain∩ threat    = threat
        safe     ∩ safe      = safe
        safe     ∩ uncertain = safe
        uncertain∩ safe      = safe
        uncertain∩ uncertain = uncertain
        threat   ∩ safe      = empty  (conflict)
        safe     ∩ threat    = empty  (conflict)
    """
    K = m1["threat"] * m2["safe"] + m1["safe"] * m2["threat"]

    if K >= 1.0:
        # Total conflict — return a flat distribution as a graceful fallback
        return {"threat": 0.33, "safe": 0.33, "uncertain": 0.34}

    norm = 1.0 / (1.0 - K)

    combined_threat = (
        m1["threat"] * m2["threat"]
        + m1["threat"] * m2["uncertain"]
        + m1["uncertain"] * m2["threat"]
    ) * norm

    combined_safe = (
        m1["safe"] * m2["safe"]
        + m1["safe"] * m2["uncertain"]
        + m1["uncertain"] * m2["safe"]
    ) * norm

    combined_uncertain = (m1["uncertain"] * m2["uncertain"]) * norm

    return {
        "threat": round(combined_threat, 6),
        "safe": round(combined_safe, 6),
        "uncertain": round(combined_uncertain, 6),
    }


def _combine_all(mass_functions: List[MassFn]) -> MassFn:
    """Sequentially combine a list of mass functions using DS rule."""
    if not mass_functions:
        return _uniform_prior()
    result = mass_functions[0]
    for mf in mass_functions[1:]:
        result = ds_combine(result, mf)
    return result


# ---------------------------------------------------------------------------
# Evidence gathering helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gather_ais_dark(mmsi: int) -> Tuple[Optional[MassFn], Optional[EvidenceSource]]:
    """Return (mass_fn, source_info) for AIS dark-event evidence."""
    try:
        if _get_dark_event is None:
            return None, None

        event = _get_dark_event(mmsi)

        if event:
            hours = float(event.get("duration_hours", 0))
            if hours < 6:
                mf = {"threat": 0.2, "safe": 0.1, "uncertain": 0.7}
                status = "detected"
                detail = "Dark {:.1f}h (<6h)".format(hours)
                confidence = 0.3
            elif hours <= 12:
                mf = {"threat": 0.4, "safe": 0.05, "uncertain": 0.55}
                status = "detected"
                detail = "Dark {:.1f}h (6-12h)".format(hours)
                confidence = 0.6
            else:
                mf = {"threat": 0.6, "safe": 0.05, "uncertain": 0.35}
                status = "detected"
                detail = "Dark {:.1f}h (>12h)".format(hours)
                confidence = 0.8
        else:
            mf = {"threat": 0.05, "safe": 0.3, "uncertain": 0.65}
            status = "clear"
            detail = "No AIS dark event"
            confidence = 0.2

        source = EvidenceSource(
            type="ais_dark_event",
            status=status,
            confidence=confidence,
            detail=detail,
            timestamp=_now_iso(),
        )
        return mf, source

    except Exception as exc:
        logger.warning("AIS dark event evidence failed for MMSI %s: %s", mmsi, exc)
        return None, None


def _gather_adsb(mmsi: int) -> Tuple[Optional[MassFn], Optional[EvidenceSource]]:
    """Return (mass_fn, source_info) for ADS-B aircraft proximity evidence."""
    try:
        if _get_aircraft_proximity is None:
            return None, None

        aircraft_list = _get_aircraft_proximity(mmsi) or []

        patrol_prefixes = ("CGN", "CBP", "USCG")
        patrol_nearby = [
            a for a in aircraft_list
            if str(a.get("callsign", "")).upper().startswith(patrol_prefixes)
            and float(a.get("distance_nm", 9999)) <= 30
        ]

        if patrol_nearby:
            callsigns = ", ".join(a.get("callsign", "?") for a in patrol_nearby)
            mf = {"threat": 0.35, "safe": 0.05, "uncertain": 0.6}
            status = "patrol_nearby"
            detail = "Patrol aircraft within 30nm: {}".format(callsigns)
            confidence = 0.7
        else:
            mf = {"threat": 0.05, "safe": 0.1, "uncertain": 0.85}
            status = "clear"
            detail = "No patrol aircraft within 30nm"
            confidence = 0.15

        source = EvidenceSource(
            type="adsb_proximity",
            status=status,
            confidence=confidence,
            detail=detail,
            timestamp=_now_iso(),
        )
        return mf, source

    except Exception as exc:
        logger.warning("ADS-B proximity evidence failed for MMSI %s: %s", mmsi, exc)
        return None, None


def _gather_sanctions(mmsi: int) -> Tuple[Optional[MassFn], Optional[EvidenceSource]]:
    """Return (mass_fn, source_info) for OFAC sanctions evidence."""
    try:
        if _get_sanctions is None:
            return None, None

        data = _get_sanctions(mmsi) or {}
        is_flagged = bool(data.get("is_flagged", False))
        hits = data.get("sanctions_hits", [])

        if is_flagged:
            mf = {"threat": 0.7, "safe": 0.02, "uncertain": 0.28}
            status = "flagged"
            detail = "OFAC sanctions hit(s): {}".format(hits) if hits else "Flagged on sanctions list"
            confidence = 0.9
        else:
            mf = {"threat": 0.02, "safe": 0.2, "uncertain": 0.78}
            status = "clear"
            detail = "Not on OFAC sanctions list"
            confidence = 0.1

        source = EvidenceSource(
            type="sanctions",
            status=status,
            confidence=confidence,
            detail=detail,
            timestamp=_now_iso(),
        )
        return mf, source

    except Exception as exc:
        logger.warning("Sanctions evidence failed for MMSI %s: %s", mmsi, exc)
        return None, None


def _gather_weather() -> Tuple[Optional[str], Optional[str]]:
    """
    Weather affects sensor confidence, not threat directly.
    Returns (weather_impact_str, informational_note).
    """
    try:
        if _get_weather is None:
            return None, None

        data = _get_weather() or {}
        stations = data.get("stations", {})
        sea_states = [s.get("sea_state", 0) for s in stations.values() if s.get("sea_state") is not None]
        sea_state = float(max(sea_states)) if sea_states else 0.0

        if sea_state >= 4:
            impact = (
                "Sea state {:.1f} (Beaufort) - sensor confidence degraded; "
                "radar and optical contacts less reliable"
            ).format(sea_state)
        else:
            impact = "Sea state {:.1f} - nominal sensor confidence".format(sea_state)

        return impact, None

    except Exception as exc:
        logger.warning("Weather evidence failed: %s", exc)
        return None, None


def _gather_overpass() -> Optional[str]:
    """Return ISO timestamp of next satellite overpass, or None."""
    try:
        if _get_overpasses is None:
            return None

        overpasses = _get_overpasses() or []
        if not overpasses:
            return None

        now = datetime.now(timezone.utc)
        future = []
        for op in overpasses:
            raw = op.get("overpass_time_utc") or op.get("overpass_time") or op.get("time") or op.get("timestamp")
            if not raw:
                continue
            try:
                if isinstance(raw, datetime):
                    t = raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
                else:
                    t = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                if t > now:
                    future.append(t)
            except (ValueError, TypeError):
                continue

        if future:
            return min(future).isoformat()
        return None

    except Exception as exc:
        logger.warning("Overpass evidence failed: %s", exc)
        return None


def _gather_intent(mmsi: int) -> Tuple[Optional[MassFn], Optional[EvidenceSource]]:
    """Return (mass_fn, source_info) for intent classification evidence."""
    try:
        if _get_intent is None:
            return None, None

        data = _get_intent(mmsi) or {}
        classification = str(data.get("classification", "normal")).lower()
        confidence = float(data.get("confidence", 1.0))
        confidence = max(0.0, min(1.0, confidence))

        base_maps = {
            "evasion":   {"threat": 0.5,  "safe": 0.05, "uncertain": 0.45},
            "loitering": {"threat": 0.3,  "safe": 0.1,  "uncertain": 0.6},
            "spoofing":  {"threat": 0.6,  "safe": 0.02, "uncertain": 0.38},
            "normal":    {"threat": 0.05, "safe": 0.4,  "uncertain": 0.55},
        }  # type: Dict[str, MassFn]
        base = base_maps.get(classification, base_maps["normal"])

        # Scale by confidence: blend toward uniform prior when confidence is low
        uniform = {"threat": 1.0 / 3, "safe": 1.0 / 3, "uncertain": 1.0 / 3}  # type: MassFn
        mf = {
            k: base[k] * confidence + uniform[k] * (1.0 - confidence)
            for k in ("threat", "safe", "uncertain")
        }  # type: MassFn

        source = EvidenceSource(
            type="intent_classifier",
            status=classification,
            confidence=confidence,
            detail="Intent: {} (conf={:.2f})".format(classification, confidence),
            timestamp=_now_iso(),
        )
        return mf, source

    except Exception as exc:
        logger.warning("Intent evidence failed for MMSI %s: %s", mmsi, exc)
        return None, None


def _gather_triage(mmsi: int) -> Tuple[Optional[MassFn], Optional[EvidenceSource]]:
    """Return (mass_fn, source_info) for triage score evidence."""
    try:
        if _get_triage is None:
            return None, None

        entries = _get_triage() or []
        vessel_entry = None  # type: Optional[Dict[str, Any]]
        for entry in entries:
            if int(entry.get("mmsi", -1)) == int(mmsi):
                vessel_entry = entry
                break

        if vessel_entry is None:
            return None, None

        score = float(vessel_entry.get("threat_score", 0.0))

        if score > 0.7:
            mf = {"threat": 0.5, "safe": 0.05, "uncertain": 0.45}  # type: MassFn
            status = "high"
        elif score >= 0.4:
            mf = {"threat": 0.3, "safe": 0.1, "uncertain": 0.6}
            status = "medium"
        else:
            mf = {"threat": 0.1, "safe": 0.2, "uncertain": 0.7}
            status = "low"

        source = EvidenceSource(
            type="triage_score",
            status=status,
            confidence=score,
            detail="Triage threat score: {:.3f}".format(score),
            timestamp=_now_iso(),
        )
        return mf, source

    except Exception as exc:
        logger.warning("Triage evidence failed for MMSI %s: %s", mmsi, exc)
        return None, None


# ---------------------------------------------------------------------------
# Recommendation
# ---------------------------------------------------------------------------

def _recommendation(threat_belief: float) -> str:
    if threat_belief > 0.7:
        return "IMMEDIATE SENSOR TASKING"
    if threat_belief > 0.4:
        return "ELEVATED MONITORING"
    return "ROUTINE TRACKING"


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

def fuse_vessel_sync(mmsi: int) -> dict | None:
    """Synchronous fusion for a single vessel. Returns dict or None on failure."""
    try:
        vessel_name = "Unknown"
        if _get_vessel_info is not None:
            info = _get_vessel_info(mmsi)
            if info is None:
                return None
            vessel_name = info.get("name") or "MMSI-{}".format(mmsi)

        mass_functions = []
        sources = []

        for gather_fn in (_gather_ais_dark, _gather_adsb, _gather_sanctions, _gather_intent, _gather_triage):
            try:
                if gather_fn in (_gather_ais_dark, _gather_adsb, _gather_sanctions, _gather_intent, _gather_triage):
                    mf, src = gather_fn(mmsi)
                if mf is not None:
                    mass_functions.append(mf)
                if src is not None:
                    sources.append(src)
            except Exception:
                continue

        if not mass_functions:
            fused = _uniform_prior()
        else:
            fused = _combine_all(mass_functions)

        return {
            "fused_threat_belief": round(fused["threat"], 6),
            "fused_safe_belief": round(fused["safe"], 6),
            "fused_uncertainty": round(fused["uncertain"], 6),
            "recommendation": _recommendation(fused["threat"]),
            "sources": [
                {"source": s.type, "confidence": s.confidence, "status": s.status}
                for s in sources
            ],
        }
    except Exception as exc:
        logger.warning("fuse_vessel_sync failed for MMSI %s: %s", mmsi, exc)
        return None


@router.get("/{mmsi}", response_model=FusionResponse)
async def fuse_vessel_evidence(mmsi: int) -> FusionResponse:
    """
    Fuse multi-source evidence for a vessel using Dempster-Shafer theory.

    Returns a combined threat belief, safe belief, and uncertainty along with
    per-source evidence records and an actionable recommendation.
    """
    # Verify vessel exists
    vessel_name = "Unknown"
    if _get_vessel_info is not None:
        try:
            info = _get_vessel_info(mmsi)
            if info is None:
                raise HTTPException(status_code=404, detail="Vessel MMSI {} not found".format(mmsi))
            vessel_name = info.get("name") or "MMSI-{}".format(mmsi)
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("vessel_info lookup failed for MMSI %s: %s", mmsi, exc)
            vessel_name = "MMSI-{}".format(mmsi)
    else:
        vessel_name = "MMSI-{}".format(mmsi)

    # -----------------------------------------------------------------------
    # Gather evidence from all sources
    # -----------------------------------------------------------------------
    mass_functions = []  # type: List[MassFn]
    sources = []  # type: List[EvidenceSource]

    # AIS dark event
    mf, src = _gather_ais_dark(mmsi)
    if mf is not None:
        mass_functions.append(mf)
    if src is not None:
        sources.append(src)

    # ADS-B aircraft proximity
    mf, src = _gather_adsb(mmsi)
    if mf is not None:
        mass_functions.append(mf)
    if src is not None:
        sources.append(src)

    # Sanctions
    mf, src = _gather_sanctions(mmsi)
    if mf is not None:
        mass_functions.append(mf)
    if src is not None:
        sources.append(src)

    # Weather (informational only — no mass function contribution)
    weather_impact, _ = _gather_weather()

    # Satellite overpass (informational only)
    next_overpass_utc = _gather_overpass()

    # Intent classifier
    mf, src = _gather_intent(mmsi)
    if mf is not None:
        mass_functions.append(mf)
    if src is not None:
        sources.append(src)

    # Triage score
    mf, src = _gather_triage(mmsi)
    if mf is not None:
        mass_functions.append(mf)
    if src is not None:
        sources.append(src)

    # -----------------------------------------------------------------------
    # DS combination
    # -----------------------------------------------------------------------
    if not mass_functions:
        fused = _uniform_prior()
    else:
        fused = _combine_all(mass_functions)

    threat_belief = fused["threat"]
    safe_belief = fused["safe"]
    uncertainty = fused["uncertain"]

    return FusionResponse(
        mmsi=mmsi,
        vessel_name=vessel_name,
        sources=sources,
        fused_threat_belief=round(threat_belief, 6),
        fused_safe_belief=round(safe_belief, 6),
        fused_uncertainty=round(uncertainty, 6),
        fusion_method="Dempster-Shafer",
        recommendation=_recommendation(threat_belief),
        next_overpass_utc=next_overpass_utc,
        weather_impact=weather_impact,
    )
