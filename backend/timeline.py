"""
Dark Event Timeline module for ARGUS Maritime Intelligence.

Builds a chronological event timeline for a given vessel (MMSI),
combining AIS position reports, dark events, correlation events,
and optional Dempster-Shafer fusion assessments.

Integration (in main.py):
    import timeline
    app.include_router(timeline.router)
    timeline._get_vessel_info = lambda mmsi: VESSEL_MAP.get(mmsi)
    timeline._get_dark_events = lambda: DARK_EVENTS
    timeline._get_correlations = lambda: find_correlations(DARK_EVENTS, threat_scores={})
    timeline._get_fusion = getattr(fusion, 'fuse_vessel_sync', None)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, Optional

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level callbacks — injected by main.py
# ---------------------------------------------------------------------------

_get_vessel_info: Optional[Callable[[int], Optional[dict]]] = None
_get_dark_events: Optional[Callable[[], list]] = None
_get_correlations: Optional[Callable[[], list]] = None
_get_fusion: Optional[Callable[[int], Optional[dict]]] = None  # may be None if fusion not available

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/timeline", tags=["timeline"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_ts(ts_str: str) -> Optional[datetime]:
    """Parse an ISO timestamp string, returning None on failure."""
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _ts_sort_key(event: dict) -> datetime:
    """Return a datetime for sorting; falls back to epoch for unparseable timestamps."""
    ts = event.get("timestamp", "")
    parsed = _parse_ts(ts)
    if parsed is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    # Make timezone-aware if naive
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("/{mmsi}")
def get_vessel_timeline(mmsi: int):
    """
    Build a chronological dark event timeline for the given vessel MMSI.

    Combines:
    - AIS position reports (every 10th track point)
    - Dark event start/end markers
    - Correlated pair events (when this vessel appears in a correlated pair)
    - Optional DS-fusion assessment (if fusion callback is available)
    """
    # --- Resolve vessel ---
    vessel: Optional[dict] = None
    if _get_vessel_info is not None:
        try:
            vessel = _get_vessel_info(mmsi)
        except Exception as exc:
            logger.warning("vessel_info lookup failed for MMSI %s: %s", mmsi, exc)

    if vessel is None:
        raise HTTPException(status_code=404, detail=f"MMSI {mmsi} not found")

    vessel_name: str = vessel.get("vessel_name") or vessel.get("name") or f"MMSI-{mmsi}"
    events: list[dict] = []

    # --- AIS position reports (every 10th track point) ---
    track: list[dict] = vessel.get("track") or []
    for i, point in enumerate(track):
        if i % 10 != 0:
            continue
        events.append({
            "type": "position",
            "timestamp": point.get("timestamp", ""),
            "lat": point.get("lat"),
            "lon": point.get("lon"),
            "speed": point.get("speed_knots"),
            "heading": point.get("heading"),
        })

    # --- Dark events ---
    dark_events: list[dict] = []
    if _get_dark_events is not None:
        try:
            dark_events = _get_dark_events() or []
        except Exception as exc:
            logger.warning("dark_events callback failed: %s", exc)

    for de in dark_events:
        if int(de.get("mmsi", -1)) != mmsi:
            continue

        dark_start = de.get("dark_start", "")
        dark_end = de.get("dark_end", "")
        lat = de.get("last_known_lat")
        lon = de.get("last_known_lon")
        duration_hours = de.get("duration_hours")

        events.append({
            "type": "dark_start",
            "timestamp": dark_start,
            "lat": lat,
            "lon": lon,
            "duration_hours": duration_hours,
        })

        events.append({
            "type": "dark_end",
            "timestamp": dark_end,
            "lat": lat,
            "lon": lon,
        })

    # --- Correlated events ---
    correlations: list[dict] = []
    if _get_correlations is not None:
        try:
            correlations = _get_correlations() or []
        except Exception as exc:
            logger.warning("correlations callback failed: %s", exc)

    for pair in correlations:
        mmsi_a = pair.get("mmsi_a")
        mmsi_b = pair.get("mmsi_b")

        if mmsi_a != mmsi and mmsi_b != mmsi:
            continue

        # Determine which side this vessel is, and which is the correlated vessel
        if mmsi_a == mmsi:
            correlated_mmsi = mmsi_b
        else:
            correlated_mmsi = mmsi_a

        # Look up correlated vessel name
        correlated_vessel_name: Optional[str] = None
        if _get_vessel_info is not None and correlated_mmsi is not None:
            try:
                corr_vessel = _get_vessel_info(correlated_mmsi)
                if corr_vessel:
                    correlated_vessel_name = corr_vessel.get("vessel_name") or corr_vessel.get("name")
            except Exception as exc:
                logger.warning("vessel_info lookup failed for correlated MMSI %s: %s", correlated_mmsi, exc)

        if correlated_vessel_name is None:
            correlated_vessel_name = f"MMSI-{correlated_mmsi}"

        # Use the dark_start of the correlated vessel's dark event as the timestamp
        corr_dark_start: Optional[str] = None
        for de in dark_events:
            if int(de.get("mmsi", -1)) == correlated_mmsi:
                corr_dark_start = de.get("dark_start")
                break

        # Fall back to the our own dark_start if not found
        if not corr_dark_start:
            for de in dark_events:
                if int(de.get("mmsi", -1)) == mmsi:
                    corr_dark_start = de.get("dark_start")
                    break

        events.append({
            "type": "correlation",
            "timestamp": corr_dark_start or _now_iso(),
            "correlated_mmsi": correlated_mmsi,
            "correlated_vessel_name": correlated_vessel_name,
            "distance_nm": pair.get("distance_nm"),
            "time_gap_hours": pair.get("time_gap_hrs"),
        })

    # --- Fusion assessment ---
    if _get_fusion is not None:
        try:
            fusion_result = _get_fusion(mmsi)
            if fusion_result is not None:
                fused_threat = fusion_result.get("fused_threat_belief")
                recommendation = fusion_result.get("recommendation")
                events.append({
                    "type": "fusion",
                    "timestamp": _now_iso(),
                    "fused_threat_belief": fused_threat,
                    "recommendation": recommendation,
                })
        except Exception as exc:
            logger.warning("fusion callback failed for MMSI %s: %s", mmsi, exc)

    # --- Sort chronologically ---
    events.sort(key=_ts_sort_key)

    # --- Compute span_hours ---
    span_hours: float = 0.0
    if len(events) >= 2:
        first_ts = _parse_ts(events[0].get("timestamp", ""))
        last_ts = _parse_ts(events[-1].get("timestamp", ""))
        if first_ts is not None and last_ts is not None:
            if first_ts.tzinfo is None:
                first_ts = first_ts.replace(tzinfo=timezone.utc)
            if last_ts.tzinfo is None:
                last_ts = last_ts.replace(tzinfo=timezone.utc)
            delta_secs = (last_ts - first_ts).total_seconds()
            span_hours = round(delta_secs / 3600, 2)

    return {
        "mmsi": mmsi,
        "vessel_name": vessel_name,
        "event_count": len(events),
        "events": events,
        "span_hours": span_hours,
    }
