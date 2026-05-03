from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine import particle_propagate, bayesian_update, recommend_sensor, ParticleCloud
from intent import classify_intent
from triage import triage_dark_events

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
    return {"triage": ranked, "count": len(ranked)}


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
