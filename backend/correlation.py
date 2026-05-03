from __future__ import annotations

import math
from datetime import datetime
from typing import TypedDict

EARTH_RADIUS_NM = 3440.065


class CorrelatedPair(TypedDict):
    mmsi_a: int
    mmsi_b: int
    time_gap_hrs: float
    distance_nm: float
    dark_location_a: dict  # {"lat": float, "lon": float}
    dark_location_b: dict  # {"lat": float, "lon": float}


def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_NM * math.asin(math.sqrt(a))


def find_correlations(
    dark_events: list[dict],
    threat_scores: dict[int, int] | None = None,
    max_time_gap_hrs: float = 0.5,
    max_distance_nm: float = 10.0,
    min_threat_score: int = 30,
) -> list[CorrelatedPair]:
    """Find pairs of dark events that are close in time and space.

    Only keeps pairs where at least one vessel has a threat score >= min_threat_score.
    """
    pairs: list[CorrelatedPair] = []
    seen: set[tuple[int, int]] = set()

    for i, event_a in enumerate(dark_events):
        for j, event_b in enumerate(dark_events):
            if j <= i:
                continue
            if event_a["mmsi"] == event_b["mmsi"]:
                continue

            key = (min(event_a["mmsi"], event_b["mmsi"]), max(event_a["mmsi"], event_b["mmsi"]))
            if key in seen:
                continue

            if threat_scores is not None:
                score_a = threat_scores.get(event_a["mmsi"], 0)
                score_b = threat_scores.get(event_b["mmsi"], 0)
                if score_a < min_threat_score and score_b < min_threat_score:
                    continue

            ts_a = datetime.fromisoformat(event_a["dark_start"])
            ts_b = datetime.fromisoformat(event_b["dark_start"])
            time_gap_hrs = abs((ts_a - ts_b).total_seconds()) / 3600

            if time_gap_hrs > max_time_gap_hrs:
                continue

            distance_nm = _haversine_nm(
                event_a["last_known_lat"], event_a["last_known_lon"],
                event_b["last_known_lat"], event_b["last_known_lon"],
            )

            if distance_nm > max_distance_nm:
                continue

            seen.add(key)
            pairs.append(CorrelatedPair(
                mmsi_a=event_a["mmsi"],
                mmsi_b=event_b["mmsi"],
                time_gap_hrs=round(time_gap_hrs, 2),
                distance_nm=round(distance_nm, 2),
                dark_location_a={"lat": event_a["last_known_lat"], "lon": event_a["last_known_lon"]},
                dark_location_b={"lat": event_b["last_known_lat"], "lon": event_b["last_known_lon"]},
            ))

    pairs.sort(key=lambda p: (p["time_gap_hrs"], p["distance_nm"]))
    return pairs
