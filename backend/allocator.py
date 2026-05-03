from __future__ import annotations

import logging
from typing import List, Optional

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

from engine import (
    particle_propagate,
    bayesian_update,
    _conformal_region,
    _entropy,
    SENSOR_CATALOG,
)
from weather import compute_sensor_degradation

log = logging.getLogger(__name__)

router = APIRouter(tags=["allocator"])

_get_triage = None
_get_dark_event = None

DEFAULT_BUDGET = [
    {"sensor_id": "SAR-SPOTLIGHT", "passes_remaining": 2},
    {"sensor_id": "SAR-STRIPMAP", "passes_remaining": 1},
    {"sensor_id": "ELINT-PASS", "passes_remaining": 1},
    {"sensor_id": "OPIR-WIDE", "passes_remaining": 1},
]

SENSOR_META = {s["sensor_id"]: s for s in SENSOR_CATALOG}


class AllocateRequest(BaseModel):
    available_sensors: Optional[List[dict]] = None
    top_n_vessels: int = 5


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


def _weather_degradation():
    try:
        return compute_sensor_degradation()
    except Exception:
        return {}


def _propagate_vessel(dark_event):
    try:
        cloud = particle_propagate(
            dark_event["last_known_lat"],
            dark_event["last_known_lon"],
            dark_event["last_known_heading"],
            dark_event["last_known_speed"],
            dt_hours=2.0,
            n_particles=1000,
        )
        return cloud, None
    except Exception as exc:
        return None, str(exc)


def _entropy_reduction_for_sensor(cloud, sensor_meta, weather_deg):
    lats = np.array(cloud["lats"])
    lons = np.array(cloud["lons"])
    weights = np.array(cloud["weights"])

    center_lat = float(np.average(lats, weights=weights))
    center_lon = float(np.average(lons, weights=weights))

    radius = sensor_meta["radius"]
    dist = np.sqrt((lats - center_lat) ** 2 + (lons - center_lon) ** 2)
    in_view = dist < radius

    if in_view.sum() == 0:
        return 0.0, None

    current_entropy = _entropy(weights)

    w_in = weights[in_view].copy()
    w_in_sum = w_in.sum()
    if w_in_sum > 0:
        w_in /= w_in_sum
    entropy_if_seen = _entropy(w_in)

    w_out = weights[~in_view].copy()
    if w_out.sum() > 0:
        w_out /= w_out.sum()
        entropy_if_not_seen = _entropy(w_out)
    else:
        entropy_if_not_seen = 0.0

    p_detect = float(weights[in_view].sum())
    expected_posterior = p_detect * entropy_if_seen + (1 - p_detect) * entropy_if_not_seen
    reduction = current_entropy - expected_posterior

    sensor_id = sensor_meta["sensor_id"]
    deg_info = weather_deg.get(sensor_id, {})
    deg_factor = float(deg_info.get("degradation", 0.0))
    weather_note = None
    if deg_factor > 0.1:
        note = deg_info.get("note", "")
        pct = int(round(deg_factor * 100))
        weather_note = "degraded %d%% — %s" % (pct, note)

    return reduction * (1.0 - deg_factor), weather_note


def _area_reduction_pct(cloud, sensor_meta):
    lats = np.array(cloud["lats"])
    lons = np.array(cloud["lons"])
    weights = np.array(cloud["weights"])

    before_region = _conformal_region(lats, lons, weights, level=0.9)
    before_area = _polygon_area_deg2(before_region["geometry"]["coordinates"][0])

    center_lat = float(np.average(lats, weights=weights))
    center_lon = float(np.average(lons, weights=weights))
    updated = bayesian_update(cloud, center_lat, center_lon, obs_sigma=sensor_meta["radius"])

    lats_u = np.array(updated["lats"])
    lons_u = np.array(updated["lons"])
    weights_u = np.array(updated["weights"])
    after_region = _conformal_region(lats_u, lons_u, weights_u, level=0.9)
    after_area = _polygon_area_deg2(after_region["geometry"]["coordinates"][0])

    if before_area > 0:
        return round(max(0.0, (before_area - after_area) / before_area * 100.0), 1)
    return 0.0


def _cloud_spread_deg(cloud):
    return float(np.std(cloud["lats"]) + np.std(cloud["lons"]))


def _build_rationale(entry, sensor_id, area_pct, weather_note, cloud):
    threat = entry.get("threat_score", 0)
    spread = _cloud_spread_deg(cloud)

    parts = []

    if threat >= 70:
        parts.append("Highest threat score (%d)" % threat)
    elif threat >= 40:
        parts.append("Elevated threat (%d)" % threat)
    else:
        parts.append("Moderate threat (%d)" % threat)

    if sensor_id == "SAR-SPOTLIGHT":
        if spread < 0.05:
            parts.append("tight particle cloud favors focused SAR")
        else:
            parts.append("SAR spotlight provides high-resolution all-weather imaging")
    elif sensor_id == "SAR-STRIPMAP":
        parts.append("SAR stripmap covers wider swath for diffuse uncertainty")
    elif sensor_id == "ELINT-PASS":
        parts.append("ELINT captures electronic emissions independent of visibility")
    elif sensor_id == "OPIR-WIDE":
        if spread > 0.08:
            parts.append("wide OPIR footprint matches large search area")
        else:
            parts.append("OPIR thermal detection supplements radar coverage")

    if weather_note:
        parts.append(weather_note)

    if area_pct > 30:
        parts.append("expected %d%% search area reduction" % int(area_pct))

    return "; ".join(parts)


def _solve(triage_entries, dark_map, available_sensors, weather_deg):
    vessel_clouds = {}
    errors = []

    for entry in triage_entries:
        mmsi = entry["mmsi"]
        dark = dark_map.get(mmsi)
        if not dark:
            errors.append({"mmsi": mmsi, "vessel_name": entry.get("vessel_name", ""), "reason": "no dark event data"})
            continue
        cloud, err = _propagate_vessel(dark)
        if cloud is None:
            errors.append({"mmsi": mmsi, "vessel_name": entry.get("vessel_name", ""), "reason": err})
            continue
        vessel_clouds[mmsi] = cloud

    scores = {}
    w_notes = {}
    for mmsi, cloud in vessel_clouds.items():
        for sid, meta in SENSOR_META.items():
            reduction, note = _entropy_reduction_for_sensor(cloud, meta, weather_deg)
            scores[(mmsi, sid)] = reduction
            if note:
                w_notes[(mmsi, sid)] = note

    budget = {}
    for s in available_sensors:
        sid = s["sensor_id"]
        if sid in SENSOR_META:
            budget[sid] = budget.get(sid, 0) + s["passes_remaining"]

    triage_map = {e["mmsi"]: e for e in triage_entries}
    assigned = set()
    allocations = []
    priority = 1

    while budget:
        best_key = None
        best_score = -1.0

        for (mmsi, sid), score in scores.items():
            if mmsi in assigned:
                continue
            if budget.get(sid, 0) <= 0:
                continue
            if score > best_score:
                best_score = score
                best_key = (mmsi, sid)

        if best_key is None or best_score <= 0:
            break

        mmsi, sensor_id = best_key
        budget[sensor_id] -= 1
        if budget[sensor_id] <= 0:
            del budget[sensor_id]
        assigned.add(mmsi)

        cloud = vessel_clouds[mmsi]
        entry = triage_map[mmsi]
        meta = SENSOR_META[sensor_id]

        area_pct = _area_reduction_pct(cloud, meta)
        note = w_notes.get((mmsi, sensor_id))

        if note:
            weather_impact = note
        else:
            deg_info = weather_deg.get(sensor_id, {})
            if float(deg_info.get("degradation", 0.0)) < 0.1:
                weather_impact = "none"
            else:
                weather_impact = deg_info.get("note", "minor degradation")

        allocations.append({
            "priority": priority,
            "mmsi": mmsi,
            "vessel_name": entry.get("vessel_name", ""),
            "threat_score": entry.get("threat_score", 0),
            "assigned_sensor": sensor_id,
            "expected_entropy_reduction": round(best_score, 4),
            "expected_area_reduction_pct": area_pct,
            "weather_impact": weather_impact,
            "rationale": _build_rationale(entry, sensor_id, area_pct, note, cloud),
        })
        priority += 1

    return allocations, errors


@router.post("/allocate")
def allocate(req: AllocateRequest):
    sensors = req.available_sensors if req.available_sensors else list(DEFAULT_BUDGET)
    top_n = req.top_n_vessels

    if _get_triage is None:
        return {"error": "Triage callback not configured"}

    triage_results = _get_triage()
    top_vessels = triage_results[:top_n]

    if not top_vessels:
        return {
            "allocations": [],
            "unassigned_vessels": [],
            "sensors_remaining": sensors,
            "total_expected_information_gain": 0.0,
            "optimization_method": "greedy_marginal_gain",
        }

    dark_map = {}
    for entry in top_vessels:
        mmsi = entry["mmsi"]
        if _get_dark_event:
            de = _get_dark_event(mmsi)
            if de:
                dark_map[mmsi] = de

    weather_deg = _weather_degradation()
    allocations, errors = _solve(top_vessels, dark_map, sensors, weather_deg)

    assigned_mmsis = {a["mmsi"] for a in allocations}
    error_mmsis = {e["mmsi"] for e in errors}
    unassigned = [
        {"mmsi": e["mmsi"], "vessel_name": e.get("vessel_name", ""), "threat_score": e.get("threat_score", 0)}
        for e in top_vessels
        if e["mmsi"] not in assigned_mmsis and e["mmsi"] not in error_mmsis
    ]
    for err in errors:
        unassigned.append({
            "mmsi": err["mmsi"],
            "vessel_name": err["vessel_name"],
            "threat_score": 0,
            "note": "skipped: %s" % err["reason"],
        })

    budget_used = {}
    for a in allocations:
        sid = a["assigned_sensor"]
        budget_used[sid] = budget_used.get(sid, 0) + 1

    sensors_remaining = []
    for s in sensors:
        remaining = s["passes_remaining"] - budget_used.get(s["sensor_id"], 0)
        if remaining > 0:
            sensors_remaining.append({"sensor_id": s["sensor_id"], "passes_remaining": remaining})

    total_gain = sum(a["expected_entropy_reduction"] for a in allocations)

    return {
        "allocations": allocations,
        "unassigned_vessels": unassigned,
        "sensors_remaining": sensors_remaining,
        "total_expected_information_gain": round(total_gain, 4),
        "optimization_method": "greedy_marginal_gain",
    }


@router.get("/allocate/default")
def allocate_default():
    req = AllocateRequest(available_sensors=None, top_n_vessels=5)
    return allocate(req)
