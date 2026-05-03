from __future__ import annotations

import time
from typing import Optional

import httpx
from fastapi import APIRouter

router = APIRouter()

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

_cache: dict = {"data": None, "ts": 0.0}
_CACHE_TTL = 300.0  # seconds — weather doesn't change that fast

# ---------------------------------------------------------------------------
# NOAA NDBC station URLs
# ---------------------------------------------------------------------------

_STATIONS = {
    "46222": {
        "name": "San Pedro",
        "url": "https://www.ndbc.noaa.gov/data/realtime2/46222.txt",
    },
    "46025": {
        "name": "Santa Monica Basin",
        "url": "https://www.ndbc.noaa.gov/data/realtime2/46025.txt",
    },
}

# NDBC column order (0-indexed after splitting the data row)
# YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
_COL = {
    "WDIR": 5,
    "WSPD": 6,
    "GST":  7,
    "WVHT": 8,
    "DPD":  9,
    "APD":  10,
    "MWD":  11,
    "PRES": 12,
    "ATMP": 13,
    "WTMP": 14,
    "DEWP": 15,
    "VIS":  16,
    "PTDY": 17,
    "TIDE": 18,
}

# ---------------------------------------------------------------------------
# Fallback data
# ---------------------------------------------------------------------------

_FALLBACK_OBS = {
    "wave_height_m": 1.2,
    "wind_speed_mps": 6.2,       # ~12 knots
    "wind_direction": 315.0,     # NW
    "dominant_wave_period": 8.0,
    "visibility_nm": 8.0,
    "air_temp_c": 18.0,
    "water_temp_c": 16.0,
    "pressure_hpa": 1015.0,
    "sea_state": 3,
    "source": "fallback",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_float(val: str) -> Optional[float]:
    """Return float or None for NDBC missing-data marker 'MM'."""
    if val == "MM":
        return None
    try:
        return float(val)
    except ValueError:
        return None


def _douglas_sea_state(wave_height_m: Optional[float]) -> int:
    """Convert wave height (metres) to Douglas scale integer (0-7)."""
    if wave_height_m is None:
        return 3  # assume moderate if unknown
    if wave_height_m < 0.1:
        return 0
    if wave_height_m < 0.5:
        return 1
    if wave_height_m < 1.25:
        return 2
    if wave_height_m < 2.5:
        return 3
    if wave_height_m < 4.0:
        return 4
    if wave_height_m < 6.0:
        return 5
    if wave_height_m < 9.0:
        return 6
    return 7


def _parse_station_txt(text: str) -> dict:
    """Parse NDBC realtime2 text file and return observation dict."""
    lines = [l for l in text.splitlines() if l.strip()]
    # First two lines are headers (#YY ... and #yr ...)
    # First data row is the most recent observation
    data_lines = [l for l in lines if not l.startswith("#")]
    if not data_lines:
        return {}

    parts = data_lines[0].split()
    if len(parts) < 17:
        return {}

    def col(key: str) -> Optional[float]:
        idx = _COL.get(key)
        if idx is None or idx >= len(parts):
            return None
        return _parse_float(parts[idx])

    wave_height_m = col("WVHT")
    return {
        "wind_speed_mps": col("WSPD"),
        "wind_direction": col("WDIR"),
        "wave_height_m": wave_height_m,
        "dominant_wave_period": col("DPD"),
        "visibility_nm": col("VIS"),
        "air_temp_c": col("ATMP"),
        "water_temp_c": col("WTMP"),
        "pressure_hpa": col("PRES"),
        "sea_state": _douglas_sea_state(wave_height_m),
        "source": "ndbc",
    }


def _fetch_station(station_id: str, url: str) -> dict:
    """Fetch a single NDBC station and return parsed obs or fallback."""
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url)
            resp.raise_for_status()
            obs = _parse_station_txt(resp.text)
            if obs:
                return obs
    except Exception:
        pass
    return dict(_FALLBACK_OBS)


def _fetch_all_stations() -> dict[str, dict]:
    """Fetch all configured stations. Always returns a complete dict."""
    result: dict[str, dict] = {}
    for station_id, meta in _STATIONS.items():
        obs = _fetch_station(station_id, meta["url"])
        result[station_id] = {
            "station_id": station_id,
            "station_name": meta["name"],
            **obs,
        }
    return result


def _get_weather() -> dict[str, dict]:
    """Return cached weather data, refreshing when stale."""
    now = time.time()
    if _cache["data"] is not None and (now - _cache["ts"]) < _CACHE_TTL:
        return _cache["data"]

    data = _fetch_all_stations()
    _cache["data"] = data
    _cache["ts"] = now
    return data


def _representative_obs() -> dict:
    """Return a single representative observation (average of available stations)."""
    weather = _get_weather()
    stations = list(weather.values())
    if not stations:
        return dict(_FALLBACK_OBS)

    # Use the first station that has live data; average numeric fields
    numeric_keys = [
        "wave_height_m", "wind_speed_mps", "wind_direction",
        "dominant_wave_period", "visibility_nm", "air_temp_c",
        "water_temp_c", "pressure_hpa",
    ]

    averaged: dict = {}
    for key in numeric_keys:
        vals = [s[key] for s in stations if s.get(key) is not None]
        averaged[key] = (sum(vals) / len(vals)) if vals else _FALLBACK_OBS.get(key)

    averaged["sea_state"] = _douglas_sea_state(averaged.get("wave_height_m"))
    return averaged

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/weather")
def get_weather():
    """Return latest NDBC buoy observations for all configured stations."""
    data = _get_weather()
    return {"stations": data, "count": len(data)}


def compute_sensor_degradation() -> dict[str, dict]:
    """Compute per-sensor degradation from current sea/weather conditions.

    Returns a dict keyed by sensor_id, each value having 'degradation' (0-1)
    and 'note' (str). Importable by engine.py for weather-aware recommendations.
    """
    obs = _representative_obs()

    visibility_nm: Optional[float] = obs.get("visibility_nm")
    wave_height_m: Optional[float] = obs.get("wave_height_m")
    pressure_hpa: Optional[float] = obs.get("pressure_hpa")

    # --- OPIR-WIDE: driven by visibility ---
    if visibility_nm is None:
        opir_deg = 0.3
        opir_note = "Visibility unknown — assuming moderate degradation"
    elif visibility_nm < 2.0:
        opir_deg = 0.8
        opir_note = f"Low visibility ({visibility_nm:.1f} nm) severely limits thermal imaging"
    elif visibility_nm < 5.0:
        opir_deg = 0.5
        opir_note = f"Reduced visibility ({visibility_nm:.1f} nm) — cloud/haze attenuation"
    elif visibility_nm < 8.0:
        opir_deg = 0.3
        opir_note = f"Moderate visibility ({visibility_nm:.1f} nm) — some atmospheric attenuation"
    else:
        opir_deg = 0.1
        opir_note = f"Good visibility ({visibility_nm:.1f} nm) — minimal OPIR degradation"

    # --- EO-SPOTLIGHT: visibility + wave height (platform stability) ---
    eo_vis_deg = opir_deg

    if wave_height_m is None:
        eo_wave_factor = 0.1
    elif wave_height_m > 4.0:
        eo_wave_factor = 0.4
    elif wave_height_m > 2.5:
        eo_wave_factor = 0.25
    elif wave_height_m > 1.25:
        eo_wave_factor = 0.15
    else:
        eo_wave_factor = 0.05

    eo_deg = min(1.0, eo_vis_deg + eo_wave_factor * 0.5)
    eo_note = (
        f"Visibility {visibility_nm:.1f} nm, wave height {wave_height_m:.2f} m — "
        f"combined optical and platform-stability penalty"
        if visibility_nm is not None and wave_height_m is not None
        else "Estimated EO degradation from available conditions"
    )

    # --- ELINT-PASS: slight degradation from pressure/wave conditions ---
    low_pressure = pressure_hpa is not None and pressure_hpa < 1005.0
    rough_sea = wave_height_m is not None and wave_height_m > 2.5
    if low_pressure and rough_sea:
        elint_deg = 0.3
        elint_note = "Low pressure and rough seas suggest precipitation — moderate signal degradation"
    elif low_pressure or rough_sea:
        elint_deg = 0.15
        elint_note = "Marginal atmospheric conditions — slight ELINT signal degradation"
    else:
        elint_deg = 0.05
        elint_note = "Stable conditions — minimal ELINT degradation"

    # --- RF-ELINT: similar to ELINT-PASS, precipitation/humidity driven ---
    rf_deg = elint_deg * 0.8
    rf_note = (
        "Precipitation/humidity estimated from sea state and pressure — "
        f"slight RF propagation loss ({rf_deg:.2f})"
    )

    return {
        "SAR-SPOTLIGHT": {
            "degradation": 0.0,
            "note": "SAR operates independently of weather and visibility — no degradation",
        },
        "SAR-STRIPMAP": {
            "degradation": 0.0,
            "note": "SAR operates independently of weather and visibility — no degradation",
        },
        "ELINT-PASS": {
            "degradation": round(elint_deg, 3),
            "note": elint_note,
        },
        "OPIR-WIDE": {
            "degradation": round(opir_deg, 3),
            "note": opir_note,
        },
        "EO-SPOTLIGHT": {
            "degradation": round(eo_deg, 3),
            "note": eo_note,
        },
        "RF-ELINT": {
            "degradation": round(rf_deg, 3),
            "note": rf_note,
        },
    }


@router.get("/weather/sensor-impact")
def get_sensor_impact():
    """Compute per-sensor degradation from current sea/weather conditions."""
    degradation = compute_sensor_degradation()
    obs = _representative_obs()
    return {
        "conditions_summary": {
            "visibility_nm": obs.get("visibility_nm"),
            "wave_height_m": obs.get("wave_height_m"),
            "pressure_hpa": obs.get("pressure_hpa"),
            "sea_state": obs.get("sea_state"),
        },
        "sensor_degradation": degradation,
    }
