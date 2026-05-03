"""
OFAC sanctions screening module for ARGUS Maritime Intelligence.

On import, attempts to download the OFAC SDN CSV from:
    https://www.treasury.gov/ofac/downloads/sdn.csv

Falls back to a hardcoded set of known sanctioned vessel names and flag states
if the download fails or is unreachable.

Integration (in main.py):
    from sanctions import router as sanctions_router, set_vessel_info_callback
    app.include_router(sanctions_router)
    set_vessel_info_callback(lambda mmsi: VESSEL_MAP.get(mmsi))
"""

from __future__ import annotations

import csv
import difflib
import io
import logging
from datetime import datetime, timezone
from typing import Callable, Optional

import httpx
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardcoded fallback data
# ---------------------------------------------------------------------------

_FALLBACK_VESSEL_NAMES: set[str] = {
    "GRACE 1",
    "ADRIAN DARYA",
    "STORM",
    "NOOR 1",
    "SARGON",
    "SAMHO JEWELRY",
    "MORNING GLORY",
    "MT RIAH",
    "HANKUK CHEMI",
    "STENA IMPERO",
    "FORTUNE",
    "FOREST",
    "BELLA",
    "PANDI",
    "FAXON",
    "ARMAN 114",
    "YOUNG YAO 8",
    "SHAHR E KORD",
    "BAVAND",
    "TERMEH",
}

_SANCTIONED_FLAG_STATES: set[str] = {
    "Iran",
    "North Korea",
    "Syria",
    "Cuba",
    "Russia",
    "Venezuela",
    "Myanmar",
    "Belarus",
    "Libya",
    "Somalia",
}

# ---------------------------------------------------------------------------
# Module-level SDN data (populated on load)
# ---------------------------------------------------------------------------

_SDN_VESSEL_NAMES: set[str] = set()

# Callback injected by main.py; signature: (mmsi: int) -> dict | None
# Expected dict keys: "vessel_name" (str), "flag_state" (str)
_get_vessel_info: Optional[Callable[[int], Optional[dict]]] = None


def set_vessel_info_callback(fn: Callable[[int], Optional[dict]]) -> None:
    """Call this from main.py after loading vessel data."""
    global _get_vessel_info
    _get_vessel_info = fn


# ---------------------------------------------------------------------------
# SDN CSV download and parse
# ---------------------------------------------------------------------------

_OFAC_SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv"

# Column indices in the SDN CSV (0-based, no header row in the actual file)
# ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign,
# Vess_Type, Tonnage, GRT, Vess_Flag, Vess_Owner, Remarks
_COL_SDN_NAME = 1
_COL_SDN_TYPE = 2


def _parse_sdn_csv(raw_text: str) -> set[str]:
    """Return a set of uppercase vessel/entity names from SDN CSV text."""
    names: set[str] = set()
    reader = csv.reader(io.StringIO(raw_text))
    for row in reader:
        if not row or len(row) <= _COL_SDN_NAME:
            continue
        name = row[_COL_SDN_NAME].strip().strip('"')
        if name:
            names.add(name.upper())
    return names


def _load_sdn_list() -> None:
    """Download and parse the OFAC SDN CSV; fall back silently on any error."""
    global _SDN_VESSEL_NAMES
    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            response = client.get(_OFAC_SDN_URL)
            response.raise_for_status()
        parsed = _parse_sdn_csv(response.text)
        if parsed:
            _SDN_VESSEL_NAMES = parsed
            logger.info("OFAC SDN list loaded: %d entries", len(_SDN_VESSEL_NAMES))
        else:
            raise ValueError("Parsed SDN list is empty")
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Failed to download/parse OFAC SDN list (%s). Using hardcoded fallback.",
            exc,
        )
        _SDN_VESSEL_NAMES = {name.upper() for name in _FALLBACK_VESSEL_NAMES}


# Run on import
_load_sdn_list()

# ---------------------------------------------------------------------------
# Fuzzy matching helpers
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.8


def _fuzzy_vessel_hits(query_name: str) -> list[dict]:
    """Return SDN hits for a vessel name using SequenceMatcher."""
    query_upper = query_name.upper()
    hits = []
    for entry in _SDN_VESSEL_NAMES:
        score = difflib.SequenceMatcher(None, query_upper, entry).ratio()
        if score >= _FUZZY_THRESHOLD:
            hits.append(
                {
                    "list": "OFAC-SDN",
                    "match_type": "vessel_name",
                    "match_score": round(score, 4),
                    "entry_name": entry,
                }
            )
    # Highest score first
    hits.sort(key=lambda h: h["match_score"], reverse=True)
    return hits


def _flag_state_hit(flag_state: str) -> Optional[dict]:
    """Return a sanctions hit if the flag state is on the sanctioned list."""
    # Normalise: strip and title-case for comparison
    normalised = flag_state.strip()
    for sanctioned in _SANCTIONED_FLAG_STATES:
        if normalised.lower() == sanctioned.lower():
            return {
                "list": "OFAC-SDN",
                "match_type": "flag_state",
                "match_score": 1.0,
                "entry_name": sanctioned,
            }
    return None


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(tags=["sanctions"])


@router.get("/sanctions/{mmsi}")
def screen_vessel(mmsi: int):
    """
    Screen a vessel against the OFAC SDN list by MMSI.

    Returns sanctions hits (vessel name fuzzy match + exact flag state match),
    an is_flagged boolean, and a screened_at ISO timestamp.
    A clean result (no hits) is still returned with is_flagged=false.
    """
    if _get_vessel_info is None:
        raise HTTPException(
            status_code=503,
            detail="Sanctions module not initialised: vessel info callback not set.",
        )

    vessel_info = _get_vessel_info(mmsi)
    if vessel_info is None:
        raise HTTPException(status_code=404, detail=f"MMSI {mmsi} not found")

    vessel_name: str = vessel_info.get("vessel_name") or vessel_info.get("name") or ""
    flag_state: str = vessel_info.get("flag_state") or ""

    sanctions_hits: list[dict] = []

    if vessel_name:
        sanctions_hits.extend(_fuzzy_vessel_hits(vessel_name))

    if flag_state:
        fs_hit = _flag_state_hit(flag_state)
        if fs_hit:
            sanctions_hits.append(fs_hit)

    return {
        "mmsi": mmsi,
        "vessel_name": vessel_name,
        "flag_state": flag_state,
        "sanctions_hits": sanctions_hits,
        "is_flagged": len(sanctions_hits) > 0,
        "screened_at": datetime.now(timezone.utc).isoformat(),
    }
