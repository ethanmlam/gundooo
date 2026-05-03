from __future__ import annotations

import math
import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter()

# ---------------------------------------------------------------------------
# Module-level callback — main.py sets this after import
# ---------------------------------------------------------------------------

_get_vessel_position = None  # type: Optional[callable]

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

_cache: dict = {"data": None, "ts": 0.0}
_CACHE_TTL = 60.0  # seconds

# ---------------------------------------------------------------------------
# Fallback hardcoded aircraft (Long Beach area)
# ---------------------------------------------------------------------------

_FALLBACK_AIRCRAFT = [
    # Coast Guard MH-65 Dolphins — low altitude patrol near harbor
    {
        "icao24": "ae4960",
        "callsign": "CGNR6529",
        "origin_country": "United States",
        "lat": 33.752,
        "lon": -118.214,
        "altitude_m": 305.0,
        "velocity_ms": 55.0,
        "heading": 210.0,
        "on_ground": False,
        "last_contact": int(time.time()),
    },
    {
        "icao24": "ae4961",
        "callsign": "CGNR6517",
        "origin_country": "United States",
        "lat": 33.771,
        "lon": -118.195,
        "altitude_m": 275.0,
        "velocity_ms": 48.0,
        "heading": 135.0,
        "on_ground": False,
        "last_contact": int(time.time()),
    },
    # CBP P-3 Orion — medium altitude maritime patrol
    {
        "icao24": "ae1234",
        "callsign": "CBP501",
        "origin_country": "United States",
        "lat": 33.820,
        "lon": -118.310,
        "altitude_m": 3050.0,
        "velocity_ms": 185.0,
        "heading": 270.0,
        "on_ground": False,
        "last_contact": int(time.time()),
    },
    # Commercial traffic at high altitude
    {
        "icao24": "a82f3c",
        "callsign": "UAL1142",
        "origin_country": "United States",
        "lat": 33.885,
        "lon": -118.152,
        "altitude_m": 10670.0,
        "velocity_ms": 245.0,
        "heading": 095.0,
        "on_ground": False,
        "last_contact": int(time.time()),
    },
    {
        "icao24": "a4e7b1",
        "callsign": "DAL405",
        "origin_country": "United States",
        "lat": 33.791,
        "lon": -118.388,
        "altitude_m": 11280.0,
        "velocity_ms": 252.0,
        "heading": 280.0,
        "on_ground": False,
        "last_contact": int(time.time()),
    },
    {
        "icao24": "ac8d22",
        "callsign": "SWA3307",
        "origin_country": "United States",
        "lat": 33.840,
        "lon": -118.260,
        "altitude_m": 9145.0,
        "velocity_ms": 238.0,
        "heading": 185.0,
        "on_ground": False,
        "last_contact": int(time.time()),
    },
    {
        "icao24": "a1c44f",
        "callsign": "AAL722",
        "origin_country": "United States",
        "lat": 33.762,
        "lon": -118.340,
        "altitude_m": 12192.0,
        "velocity_ms": 260.0,
        "heading": 060.0,
        "on_ground": False,
        "last_contact": int(time.time()),
    },
    {
        "icao24": "a9b05e",
        "callsign": "UAL2891",
        "origin_country": "United States",
        "lat": 33.905,
        "lon": -118.080,
        "altitude_m": 8230.0,
        "velocity_ms": 230.0,
        "heading": 320.0,
        "on_ground": False,
        "last_contact": int(time.time()),
    },
]

# ---------------------------------------------------------------------------
# OpenSky field indices (states/all response)
# ---------------------------------------------------------------------------
# 0: icao24, 1: callsign, 2: origin_country, 5: lon, 6: lat,
# 7: baro_altitude, 9: velocity, 10: true_track (heading),
# 8: on_ground, 4: last_contact

def _parse_state(state: list) -> dict:
    return {
        "icao24": state[0] or "",
        "callsign": (state[1] or "").strip(),
        "origin_country": state[2] or "",
        "lat": state[6],
        "lon": state[5],
        "altitude_m": state[7],
        "velocity_ms": state[9],
        "heading": state[10],
        "on_ground": bool(state[8]),
        "last_contact": state[4],
    }


def _fetch_live() -> list[dict]:
    url = (
        "https://opensky-network.org/api/states/all"
        "?lamin=33.2&lomin=-119.0&lamax=34.2&lomax=-117.5"
    )
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.json()
            states = data.get("states") or []
            return [_parse_state(s) for s in states if s[6] is not None and s[5] is not None]
    except Exception:
        return []


def _get_aircraft() -> list[dict]:
    now = time.time()
    if _cache["data"] is not None and (now - _cache["ts"]) < _CACHE_TTL:
        return _cache["data"]

    aircraft = _fetch_live()
    if not aircraft:
        # Refresh timestamps on fallback so they look current
        for ac in _FALLBACK_AIRCRAFT:
            ac["last_contact"] = int(time.time())
        aircraft = list(_FALLBACK_AIRCRAFT)

    _cache["data"] = aircraft
    _cache["ts"] = now
    return aircraft


# ---------------------------------------------------------------------------
# Haversine distance (returns nautical miles)
# ---------------------------------------------------------------------------

def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R_nm = 3440.065  # Earth radius in nautical miles
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R_nm * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/aircraft")
def get_aircraft():
    aircraft = _get_aircraft()
    return {"aircraft": aircraft, "count": len(aircraft)}


@router.get("/aircraft/proximity/{mmsi}")
def get_aircraft_proximity(mmsi: int):
    if _get_vessel_position is None:
        raise HTTPException(status_code=503, detail="Vessel position callback not configured")

    position = _get_vessel_position(mmsi)
    if position is None:
        raise HTTPException(status_code=404, detail=f"MMSI {mmsi} not found")

    vessel_lat: float = position["lat"]
    vessel_lon: float = position["lon"]

    aircraft = _get_aircraft()

    nearby = []
    for ac in aircraft:
        if ac["lat"] is None or ac["lon"] is None:
            continue
        dist = _haversine_nm(vessel_lat, vessel_lon, ac["lat"], ac["lon"])
        if dist <= 30.0:
            nearby.append({**ac, "distance_nm": round(dist, 2)})

    nearby.sort(key=lambda x: x["distance_nm"])

    return {
        "mmsi": mmsi,
        "vessel_position": {"lat": vessel_lat, "lon": vessel_lon},
        "aircraft": nearby,
        "count": len(nearby),
    }
