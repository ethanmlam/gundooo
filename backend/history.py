"""
Vessel Dark History Module

Provides a per-vessel history of all AIS dark events, including pattern
classification and a dark-frequency score for downstream fusion.

Integration (in main.py):
    import history
    app.include_router(history.router)
    history._get_dark_events = lambda: DARK_EVENTS
    history._get_vessel_info = lambda mmsi: VESSEL_MAP.get(mmsi)
"""

from __future__ import annotations

from typing import Callable, Optional

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["history"])

# ---------------------------------------------------------------------------
# Module-level callbacks — injected by main.py
# ---------------------------------------------------------------------------

_get_dark_events: Optional[Callable[[], list[dict]]] = None
_get_vessel_info: Optional[Callable[[int], Optional[dict]]] = None


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("/history/{mmsi}")
def get_vessel_dark_history(mmsi: int):
    """
    Return the full dark-event history for a vessel.

    Includes pattern classification (SINGLE / REPEAT / SERIAL) and a
    dark_frequency_score (0-100) that can feed into the fusion module.
    """
    if _get_vessel_info is None:
        raise HTTPException(
            status_code=503,
            detail="History module not initialised: vessel info callback not set.",
        )

    vessel = _get_vessel_info(mmsi)
    if vessel is None:
        raise HTTPException(status_code=404, detail=f"MMSI {mmsi} not found")

    vessel_name = vessel.get("vessel_name") or vessel.get("name") or f"MMSI-{mmsi}"

    if _get_dark_events is None:
        dark_events = []
    else:
        dark_events = _get_dark_events() or []

    matching = [
        {
            "dark_start": e.get("dark_start"),
            "dark_end": e.get("dark_end"),
            "duration_hours": e.get("duration_hours"),
            "last_known_lat": e.get("last_known_lat"),
            "last_known_lon": e.get("last_known_lon"),
            "last_known_speed": e.get("last_known_speed"),
        }
        for e in dark_events
        if e.get("mmsi") == mmsi
    ]

    matching.sort(key=lambda e: e.get("dark_start") or "", reverse=True)

    total = len(matching)

    if total >= 3:
        pattern = f"SERIAL — vessel has gone dark {total} times"
        dark_frequency_score = 90
    elif total == 2:
        pattern = "REPEAT — vessel has gone dark twice"
        dark_frequency_score = 50
    else:
        pattern = "SINGLE — one recorded dark event"
        dark_frequency_score = 10

    return {
        "mmsi": mmsi,
        "vessel_name": vessel_name,
        "total_dark_events": total,
        "events": matching,
        "pattern": pattern,
        "dark_frequency_score": dark_frequency_score,
    }
