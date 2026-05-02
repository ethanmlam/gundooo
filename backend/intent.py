from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import TypedDict

import numpy as np

EARTH_RADIUS_NM = 3440.065

SHIPPING_LANES = {
    "LA-Honolulu": ((33.72, -118.27), (21.31, -157.86)),
    "LA-Asia": ((33.72, -118.27), (34.50, 140.00)),
}

PORTS = {
    "Los Angeles": (33.73, -118.27),
    "Long Beach": (33.75, -118.19),
}


class IntentFeatures(TypedDict):
    speed_variance: float
    heading_variance: float
    speed_change_rate: float
    distance_from_shipping_lane_nm: float
    nearest_lane: str
    proximity_to_other_vessels_nm: float
    nearest_vessel_mmsi: int | None
    mean_speed: float
    track_points_analyzed: int


class IntentResult(TypedDict):
    intent: str
    confidence: float
    reasoning: str
    features: IntentFeatures


def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_NM * math.asin(math.sqrt(a))


def _bearing_rad(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return math.atan2(x, y)


def _cross_track_distance_nm(
    route_start: tuple[float, float],
    route_end: tuple[float, float],
    point: tuple[float, float],
) -> float:
    lat_a, lon_a = route_start
    lat_b, lon_b = route_end
    lat_p, lon_p = point
    d_ap = _haversine_nm(lat_a, lon_a, lat_p, lon_p) / EARTH_RADIUS_NM
    bearing_ap = _bearing_rad(lat_a, lon_a, lat_p, lon_p)
    bearing_ab = _bearing_rad(lat_a, lon_a, lat_b, lon_b)
    cross_track = math.asin(
        max(-1.0, min(1.0, math.sin(d_ap) * math.sin(bearing_ap - bearing_ab)))
    )
    return abs(cross_track) * EARTH_RADIUS_NM


def _circular_variance(headings_deg: list[float]) -> float:
    if len(headings_deg) < 2:
        return 0.0
    rads = np.deg2rad(headings_deg)
    R = math.sqrt(float(np.mean(np.cos(rads))) ** 2 + float(np.mean(np.sin(rads))) ** 2)
    return round(1.0 - R, 6)


def _compute_features(
    track: list[dict],
    all_vessels: list[dict],
    dark_events: list[dict],
    mmsi: int,
) -> IntentFeatures:
    timestamps = [datetime.fromisoformat(p["timestamp"]) for p in track]
    latest_ts = max(timestamps)
    cutoff = latest_ts - timedelta(hours=2)

    recent = [(ts, p) for ts, p in zip(timestamps, track) if ts >= cutoff]
    if len(recent) < 2:
        recent = list(zip(timestamps, track))[-10:]

    speeds = [p["speed_knots"] for _, p in recent]
    headings = [p["heading"] for _, p in recent]

    speed_variance = float(np.var(speeds)) if len(speeds) > 1 else 0.0
    heading_variance = _circular_variance(headings)
    mean_speed = float(np.mean(speeds))

    dark = next((d for d in dark_events if d["mmsi"] == mmsi), None)
    speed_change_rate = 0.0
    if dark:
        dark_start = datetime.fromisoformat(dark["dark_start"])
        pre_dark = [(ts, p) for ts, p in zip(timestamps, track) if ts <= dark_start]
        if len(pre_dark) >= 2:
            pre_points = pre_dark[-5:]
            pre_speeds = [p["speed_knots"] for _, p in pre_points]
            duration_h = (pre_points[-1][0] - pre_points[0][0]).total_seconds() / 3600
            if duration_h > 0:
                speed_change_rate = (pre_speeds[-1] - pre_speeds[0]) / duration_h

    last_pos = track[-1]
    point = (last_pos["lat"], last_pos["lon"])

    min_lane_dist = float("inf")
    nearest_lane = ""
    for name, (start, end) in SHIPPING_LANES.items():
        d = _cross_track_distance_nm(start, end, point)
        if d < min_lane_dist:
            min_lane_dist = d
            nearest_lane = name

    ref_time = dark["dark_start"] if dark else track[-1]["timestamp"]
    ref_ts = datetime.fromisoformat(ref_time) if isinstance(ref_time, str) else ref_time
    ref_lat, ref_lon = last_pos["lat"], last_pos["lon"]

    min_vessel_dist = float("inf")
    nearest_mmsi: int | None = None
    for v in all_vessels:
        if v["mmsi"] == mmsi:
            continue
        for p in v["track"]:
            p_ts = datetime.fromisoformat(p["timestamp"])
            if abs((p_ts - ref_ts).total_seconds()) < 1800:
                d = _haversine_nm(ref_lat, ref_lon, p["lat"], p["lon"])
                if d < min_vessel_dist:
                    min_vessel_dist = d
                    nearest_mmsi = v["mmsi"]
    if min_vessel_dist == float("inf"):
        min_vessel_dist = 999.0

    return IntentFeatures(
        speed_variance=round(speed_variance, 4),
        heading_variance=round(heading_variance, 4),
        speed_change_rate=round(speed_change_rate, 4),
        distance_from_shipping_lane_nm=round(min_lane_dist, 2),
        nearest_lane=nearest_lane,
        proximity_to_other_vessels_nm=round(min_vessel_dist, 2),
        nearest_vessel_mmsi=nearest_mmsi,
        mean_speed=round(mean_speed, 2),
        track_points_analyzed=len(recent),
    )


def classify_intent(
    track: list[dict],
    all_vessels: list[dict],
    dark_events: list[dict],
    mmsi: int,
) -> IntentResult:
    features = _compute_features(track, all_vessels, dark_events, mmsi)

    has_dark = any(d["mmsi"] == mmsi for d in dark_events)
    near_port = any(
        _haversine_nm(track[-1]["lat"], track[-1]["lon"], plat, plon) < 5.0
        for plat, plon in PORTS.values()
    )

    intent = "normal_transit"
    confidence = 0.5
    reasons: list[str] = []

    if features["mean_speed"] < 1.0 and near_port:
        intent = "anchoring"
        confidence = 0.85
        reasons.append(f"Mean speed {features['mean_speed']} kn near zero while within 5 nm of port")

    elif features["speed_variance"] > 2.0 and features["heading_variance"] > 0.3:
        intent = "loitering"
        confidence = 0.75
        reasons.append(
            f"High speed variance ({features['speed_variance']:.2f}) "
            f"and heading variance ({features['heading_variance']:.2f}) indicate circling/drifting"
        )

    elif (features["speed_change_rate"] > 1.0
          and features["distance_from_shipping_lane_nm"] > 20
          and has_dark):
        intent = "evasion"
        confidence = 0.70
        reasons.append(
            f"Speed increasing at {features['speed_change_rate']:.2f} kn/hr, "
            f"{features['distance_from_shipping_lane_nm']:.1f} nm from {features['nearest_lane']} lane, "
            f"with AIS dark period"
        )

    elif features["proximity_to_other_vessels_nm"] < 1.0:
        intent = "rendezvous"
        confidence = 0.65
        reasons.append(
            f"Within {features['proximity_to_other_vessels_nm']:.2f} nm "
            f"of vessel MMSI {features['nearest_vessel_mmsi']}"
        )

    elif has_dark and features["distance_from_shipping_lane_nm"] > 30:
        intent = "evasion"
        confidence = 0.55
        reasons.append(
            f"AIS dark period while {features['distance_from_shipping_lane_nm']:.1f} nm "
            f"from nearest lane ({features['nearest_lane']})"
        )

    else:
        if features["distance_from_shipping_lane_nm"] < 15:
            confidence = 0.80
            reasons.append(
                f"Within {features['distance_from_shipping_lane_nm']:.1f} nm "
                f"of {features['nearest_lane']} lane at {features['mean_speed']:.1f} kn"
            )
        else:
            confidence = 0.60
            reasons.append(
                f"No strong anomaly indicators — speed variance {features['speed_variance']:.2f}, "
                f"heading variance {features['heading_variance']:.2f}"
            )

    if has_dark and intent == "evasion":
        confidence = min(confidence + 0.10, 0.95)
        reasons.append("AIS dark period corroborates evasion hypothesis")

    if intent == "loitering" and features["mean_speed"] < 3.0:
        confidence = min(confidence + 0.10, 0.95)
        reasons.append("Low mean speed supports loitering classification")

    return IntentResult(
        intent=intent,
        confidence=round(confidence, 2),
        reasoning=". ".join(reasons),
        features=features,
    )
