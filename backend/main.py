from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine import particle_propagate, bayesian_update, recommend_sensor, ParticleCloud, _conformal_region
from intent import classify_intent
from triage import triage_dark_events, get_model_weights, retrain_with_fusion
from correlation import find_correlations
import adsb
import sanctions
import weather
import satellite
import fusion
import history
import timeline
import allocator

app = FastAPI(title="ARGUS Maritime Intelligence")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AIS VesselType code mapping ---

VESSEL_TYPE_NAMES = {
    30: "fishing", 31: "towing", 32: "towing_large", 33: "dredging",
    34: "diving_ops", 35: "military", 36: "sailing", 37: "pleasure_craft",
    40: "high_speed_craft", 50: "pilot", 51: "sar", 52: "tug",
    53: "port_tender", 55: "law_enforcement", 60: "passenger",
    70: "cargo", 71: "cargo_hazardous_a", 72: "cargo_hazardous_b",
    80: "tanker", 81: "tanker_hazardous_a", 82: "tanker_hazardous_b",
    89: "tanker_other", 90: "other",
}

DARK_GAP_HOURS = 4.0


def _load_real_data():
    csv_path = Path(__file__).parent / "data" / "AIS_real.csv"
    df = pd.read_csv(csv_path, parse_dates=["BaseDateTime"])
    df = df.sort_values(["MMSI", "BaseDateTime"]).reset_index(drop=True)

    # Vectorized heading: use Heading unless 511 or NaN, then fall back to COG
    heading_valid = df["Heading"].notna() & (df["Heading"] != 511)
    df["heading_clean"] = np.where(heading_valid, df["Heading"], df["COG"].fillna(0.0))
    df["heading_clean"] = df["heading_clean"].round(1)
    df["SOG"] = df["SOG"].fillna(0.0).round(1)
    df["LAT"] = df["LAT"].round(6)
    df["LON"] = df["LON"].round(6)
    df["ts_iso"] = df["BaseDateTime"].dt.strftime("%Y-%m-%dT%H:%M:%S")

    # Detect dark periods vectorized
    df["gap_hours"] = df.groupby("MMSI")["BaseDateTime"].diff().dt.total_seconds() / 3600
    dark_mask = df["gap_hours"] >= DARK_GAP_HOURS
    dark_indices = df.index[dark_mask]

    dark_events = []
    for idx in dark_indices:
        row_after = df.loc[idx]
        row_before = df.loc[idx - 1]
        mmsi = int(row_before["MMSI"])
        vtype_code = int(row_before["VesselType"]) if pd.notna(row_before["VesselType"]) else 0
        dark_events.append({
            "mmsi": mmsi,
            "vessel_name": str(row_before["VesselName"]).strip() if pd.notna(row_before["VesselName"]) else f"MMSI-{mmsi}",
            "vessel_type": VESSEL_TYPE_NAMES.get(vtype_code, f"type_{vtype_code}"),
            "dark_start": row_before["ts_iso"],
            "dark_end": row_after["ts_iso"],
            "duration_hours": round(float(row_after["gap_hours"]), 1),
            "last_known_lat": float(row_before["LAT"]),
            "last_known_lon": float(row_before["LON"]),
            "last_known_heading": float(row_before["heading_clean"]),
            "last_known_speed": float(row_before["SOG"]),
        })

    dark_events.sort(key=lambda e: e["duration_hours"], reverse=True)

    # Build vessel summaries using vectorized groupby
    vessels = []
    vessel_meta = df.groupby("MMSI").first()[["VesselName", "VesselType"]].reset_index()

    for mmsi, group in df.groupby("MMSI", sort=False):
        row0 = group.iloc[0]
        vtype_code = int(row0["VesselType"]) if pd.notna(row0["VesselType"]) else 0
        vessel_type = VESSEL_TYPE_NAMES.get(vtype_code, f"type_{vtype_code}")
        name = str(row0["VesselName"]).strip() if pd.notna(row0["VesselName"]) else f"MMSI-{mmsi}"

        track = [
            {"timestamp": ts, "lat": lat, "lon": lon, "heading": hdg, "speed_knots": sog}
            for ts, lat, lon, hdg, sog in zip(
                group["ts_iso"].values,
                group["LAT"].values,
                group["LON"].values,
                group["heading_clean"].values,
                group["SOG"].values,
            )
        ]

        vessels.append({
            "mmsi": int(mmsi),
            "vessel_type": vessel_type,
            "name": name,
            "vessel_name": name,
            "track": track,
            "last_position": track[-1] if track else None,
        })

    return vessels, dark_events


VESSELS, DARK_EVENTS = _load_real_data()
VESSEL_MAP = {v["mmsi"]: v for v in VESSELS}
PARTICLE_CLOUDS: dict[int, ParticleCloud] = {}
_FUSION_CACHE: dict[int, dict] = {}


def _get_or_compute_fusion(mmsi: int) -> dict | None:
    if mmsi in _FUSION_CACHE:
        return _FUSION_CACHE[mmsi]
    result = fusion.fuse_vessel_sync(mmsi)
    if result is not None:
        _FUSION_CACHE[mmsi] = result
    return result


# --- GET endpoints ---

@app.get("/vessels")
def get_vessels():
    summary = []
    for v in VESSELS:
        summary.append({
            "mmsi": v["mmsi"],
            "vessel_type": v["vessel_type"],
            "name": v["name"],
            "vessel_name": v["name"],
            "last_position": v["last_position"],
            "track_points": v["track"],
            "track_point_count": len(v["track"]),
        })
    return {"vessels": summary, "count": len(summary)}


@app.get("/dark-events")
def get_dark_events():
    return {"dark_events": DARK_EVENTS, "count": len(DARK_EVENTS)}


# --- Engine endpoints ---

class PredictRequest(BaseModel):
    mmsi: int
    dt_hours: float = 6.0
    n_particles: int = 1000


class UpdateRequest(BaseModel):
    mmsi: int
    obs_lat: Optional[float] = None
    obs_lon: Optional[float] = None
    obs_sigma: float = 0.01
    observation_lat: Optional[float] = None
    observation_lon: Optional[float] = None
    sensor_type: Optional[str] = None
    confidence: Optional[float] = None


@app.post("/predict")
def predict(req: PredictRequest):
    vessel = VESSEL_MAP.get(req.mmsi)
    if not vessel:
        raise HTTPException(status_code=404, detail=f"MMSI {req.mmsi} not found")

    dark = next((d for d in DARK_EVENTS if d["mmsi"] == req.mmsi), None)
    if dark and dark["last_known_lat"]:
        lat = dark["last_known_lat"]
        lon = dark["last_known_lon"]
        heading = dark["last_known_heading"]
        speed = dark["last_known_speed"]
    elif vessel["last_position"]:
        lat = vessel["last_position"]["lat"]
        lon = vessel["last_position"]["lon"]
        heading = vessel["last_position"]["heading"]
        speed = vessel["last_position"]["speed_knots"]
    else:
        raise HTTPException(status_code=400, detail="No position data available")

    cloud = particle_propagate(lat, lon, heading, speed, req.dt_hours, req.n_particles)
    PARTICLE_CLOUDS[req.mmsi] = cloud

    return {
        "mmsi": req.mmsi,
        "n_particles": req.n_particles,
        "dt_hours": req.dt_hours,
        "cloud": cloud,
    }


@app.post("/update")
def update(req: UpdateRequest):
    if req.mmsi not in PARTICLE_CLOUDS:
        raise HTTPException(status_code=400, detail=f"No particle cloud for MMSI {req.mmsi}. Call /predict first.")

    obs_lat = req.obs_lat if req.obs_lat is not None else req.observation_lat
    obs_lon = req.obs_lon if req.obs_lon is not None else req.observation_lon
    if obs_lat is None or obs_lon is None:
        raise HTTPException(status_code=400, detail="obs_lat/obs_lon or observation_lat/observation_lon required")

    cloud = PARTICLE_CLOUDS[req.mmsi]
    sigma = req.obs_sigma
    if req.confidence is not None and req.confidence > 0:
        sigma = max(0.003, 0.03 * (1.0 - min(req.confidence, 0.99)))
    updated = bayesian_update(cloud, obs_lat, obs_lon, sigma)
    PARTICLE_CLOUDS[req.mmsi] = updated

    return {
        "mmsi": req.mmsi,
        "observation": {"lat": obs_lat, "lon": obs_lon, "sensor_type": req.sensor_type, "confidence": req.confidence},
        "cloud": updated,
    }


@app.get("/recommend/{mmsi}")
def recommend(mmsi: int):
    if mmsi not in PARTICLE_CLOUDS:
        raise HTTPException(status_code=400, detail=f"No particle cloud for MMSI {mmsi}. Call /predict first.")

    cloud = PARTICLE_CLOUDS[mmsi]
    result = recommend_sensor(cloud)

    return {
        "mmsi": mmsi,
        "taskings": result["taskings"],
        "prediction_region": result["prediction_region"],
    }


@app.get("/triage")
def get_triage():
    ranked = triage_dark_events(DARK_EVENTS, VESSELS, VESSEL_MAP)
    enriched = []
    for entry in ranked:
        item = dict(entry)
        cached = _FUSION_CACHE.get(entry["mmsi"])
        if cached:
            item["fused_threat_belief"] = cached.get("fused_threat_belief")
            item["fusion_recommendation"] = cached.get("recommendation")
            item["source_breakdown"] = cached.get("sources")
        else:
            item["fused_threat_belief"] = None
            item["fusion_recommendation"] = None
            item["source_breakdown"] = None
        enriched.append(item)
    return {"triage": enriched, "count": len(enriched)}


@app.get("/correlations")
def get_correlations():
    ranked = triage_dark_events(DARK_EVENTS, VESSELS, VESSEL_MAP)
    threat_scores = {entry["mmsi"]: entry["threat_score"] for entry in ranked}
    pairs = find_correlations(DARK_EVENTS, threat_scores=threat_scores)
    return {"correlations": pairs, "count": len(pairs)}


@app.get("/intent/{mmsi}")
def get_intent(mmsi: int):
    vessel = VESSEL_MAP.get(mmsi)
    if not vessel:
        raise HTTPException(status_code=404, detail=f"MMSI {mmsi} not found")
    if len(vessel["track"]) < 2:
        raise HTTPException(status_code=400, detail="Insufficient track data")
    result = classify_intent(vessel["track"], VESSELS, DARK_EVENTS, mmsi)
    return {
        "mmsi": mmsi,
        "vessel_name": vessel["name"],
        "vessel_type": vessel["vessel_type"],
        **result,
    }


def _polygon_area_deg2(coords):
    n = len(coords)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += coords[i][0] * coords[j][1]
        area -= coords[j][0] * coords[i][1]
    return abs(area) / 2.0


@app.get("/search-loop/{mmsi}")
def search_loop(mmsi: int):
    vessel = VESSEL_MAP.get(mmsi)
    if not vessel:
        raise HTTPException(status_code=404, detail=f"MMSI {mmsi} not found")

    # 1. Determine starting position — prefer dark event data
    dark = next((d for d in DARK_EVENTS if d["mmsi"] == mmsi), None)
    if dark and dark["last_known_lat"]:
        lat = dark["last_known_lat"]
        lon = dark["last_known_lon"]
        heading = dark["last_known_heading"]
        speed = dark["last_known_speed"]
    elif vessel["last_position"]:
        lat = vessel["last_position"]["lat"]
        lon = vessel["last_position"]["lon"]
        heading = vessel["last_position"]["heading"]
        speed = vessel["last_position"]["speed_knots"]
    else:
        raise HTTPException(status_code=400, detail="No position data available")

    # 2. Propagate particle cloud (local — does not touch PARTICLE_CLOUDS global)
    cloud = particle_propagate(lat, lon, heading, speed, dt_hours=2.0, n_particles=1000)

    # 3. Recommend best sensor tasking
    rec = recommend_sensor(cloud)
    top_sensor = rec["taskings"][0]

    # 4. BEFORE conformal region (90%)
    lats_arr = np.array(cloud["lats"])
    lons_arr = np.array(cloud["lons"])
    weights_arr = np.array(cloud["weights"])
    before_polygon = _conformal_region(lats_arr, lons_arr, weights_arr, level=0.9)

    # 5. Simulate observation at sensor center
    obs_lat = top_sensor["center_lat"]
    obs_lon = top_sensor["center_lon"]
    updated_cloud = bayesian_update(cloud, obs_lat, obs_lon, obs_sigma=0.02)

    # 6. AFTER conformal region
    lats_upd = np.array(updated_cloud["lats"])
    lons_upd = np.array(updated_cloud["lons"])
    weights_upd = np.array(updated_cloud["weights"])
    after_polygon = _conformal_region(lats_upd, lons_upd, weights_upd, level=0.9)

    # 7. Area reduction using shoelace formula
    before_coords = before_polygon["geometry"]["coordinates"][0]
    after_coords = after_polygon["geometry"]["coordinates"][0]
    before_area = _polygon_area_deg2(before_coords)
    after_area = _polygon_area_deg2(after_coords)
    if before_area > 0:
        area_reduction_pct = float((before_area - after_area) / before_area * 100.0)
    else:
        area_reduction_pct = 0.0

    return {
        "mmsi": mmsi,
        "before_polygon": before_polygon,
        "after_polygon": after_polygon,
        "area_reduction_pct": area_reduction_pct,
        "recommended_sensor": dict(top_sensor),
    }


@app.get("/triage/retrain")
def retrain_triage():
    """Retrain the triage model using Dempster-Shafer fusion-derived labels."""
    def _sync_fusion(mmsi: int) -> dict | None:
        return _get_or_compute_fusion(mmsi)
    try:
        result = retrain_with_fusion(DARK_EVENTS, VESSELS, VESSEL_MAP, _sync_fusion)
        if result is None:
            raise HTTPException(status_code=500, detail="Retraining failed — insufficient data")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retraining failed: {exc}")


@app.get("/triage/fuse-all")
def fuse_all_triage():
    """Compute fusion for all dark-event vessels, populating the cache."""
    fused_count = 0
    already_cached = 0
    for event in DARK_EVENTS:
        mmsi = event["mmsi"]
        if mmsi in _FUSION_CACHE:
            already_cached += 1
            continue
        result = fusion.fuse_vessel_sync(mmsi)
        if result is not None:
            _FUSION_CACHE[mmsi] = result
            fused_count += 1
    return {"fused_count": fused_count, "cached_count": already_cached + fused_count}


@app.get("/triage/weights")
def get_triage_weights():
    weights = get_model_weights()
    if weights is None:
        raise HTTPException(status_code=404, detail="Model not yet trained. Call /triage first.")
    return weights


# --- Register new module routers and wire up callbacks ---

app.include_router(adsb.router)
app.include_router(sanctions.router)
app.include_router(weather.router)
app.include_router(satellite.router)
app.include_router(fusion.router)
app.include_router(history.router)
app.include_router(timeline.router)
app.include_router(allocator.router)

# ADS-B: vessel position lookup
def _vessel_position(mmsi):
    v = VESSEL_MAP.get(mmsi)
    if not v or not v.get("last_position"):
        return None
    return {"lat": v["last_position"]["lat"], "lon": v["last_position"]["lon"]}

adsb._get_vessel_position = _vessel_position

# Sanctions: vessel info lookup
sanctions.set_vessel_info_callback(lambda mmsi: VESSEL_MAP.get(mmsi))

# Fusion: wire all callbacks
fusion._get_dark_event = lambda mmsi: next((d for d in DARK_EVENTS if d["mmsi"] == mmsi), None)

def _fusion_aircraft_proximity(mmsi):
    pos = _vessel_position(mmsi)
    if not pos:
        return []
    aircraft = adsb._get_aircraft()
    import math
    R_nm = 3440.065
    nearby = []
    for ac in aircraft:
        if ac["lat"] is None or ac["lon"] is None:
            continue
        dist = adsb._haversine_nm(pos["lat"], pos["lon"], ac["lat"], ac["lon"])
        if dist <= 30.0:
            nearby.append({**ac, "distance_nm": round(dist, 2)})
    nearby.sort(key=lambda x: x["distance_nm"])
    return nearby

fusion._get_aircraft_proximity = _fusion_aircraft_proximity

def _fusion_sanctions(mmsi):
    v = VESSEL_MAP.get(mmsi)
    if not v:
        return {"is_flagged": False, "sanctions_hits": []}
    from sanctions import _fuzzy_vessel_hits, _flag_state_hit
    vessel_name = v.get("vessel_name") or v.get("name") or ""
    flag_state = v.get("flag_state", "")
    hits = []
    if vessel_name:
        hits.extend(_fuzzy_vessel_hits(vessel_name))
    if flag_state:
        fs_hit = _flag_state_hit(flag_state)
        if fs_hit:
            hits.append(fs_hit)
    return {"is_flagged": len(hits) > 0, "sanctions_hits": hits}

fusion._get_sanctions = _fusion_sanctions
fusion._get_weather = lambda: weather._get_weather()
fusion._get_overpasses = lambda: satellite._get_overpasses()

def _fusion_intent(mmsi):
    v = VESSEL_MAP.get(mmsi)
    if not v or len(v["track"]) < 2:
        return {"classification": "normal", "confidence": 0.5}
    result = classify_intent(v["track"], VESSELS, DARK_EVENTS, mmsi)
    return result

fusion._get_intent = _fusion_intent

def _fusion_triage():
    return triage_dark_events(DARK_EVENTS, VESSELS, VESSEL_MAP)

fusion._get_triage = _fusion_triage
fusion._get_vessel_info = lambda mmsi: VESSEL_MAP.get(mmsi)

# History: wire callbacks
history._get_dark_events = lambda: DARK_EVENTS
history._get_vessel_info = lambda mmsi: VESSEL_MAP.get(mmsi)

# Timeline: wire all callbacks
timeline._get_vessel_info = lambda mmsi: VESSEL_MAP.get(mmsi)
timeline._get_dark_events = lambda: DARK_EVENTS
timeline._get_correlations = lambda: find_correlations(DARK_EVENTS, threat_scores={})
timeline._get_fusion = getattr(fusion, 'fuse_vessel_sync', None)

# Allocator: wire callbacks
allocator._get_triage = lambda: triage_dark_events(DARK_EVENTS, VESSELS, VESSEL_MAP)
allocator._get_dark_event = lambda mmsi: next((d for d in DARK_EVENTS if d["mmsi"] == mmsi), None)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
