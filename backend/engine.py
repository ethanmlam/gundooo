from __future__ import annotations

import numpy as np
from typing import TypedDict
from numpy.typing import NDArray


class ParticleCloud(TypedDict):
    lats: list[float]
    lons: list[float]
    headings: list[float]
    speeds: list[float]
    weights: list[float]


class SensorTasking(TypedDict):
    sensor_id: str
    expected_entropy_reduction: float
    center_lat: float
    center_lon: float


class Recommendation(TypedDict):
    taskings: list[SensorTasking]
    prediction_region: dict


def particle_propagate(
    lat: float,
    lon: float,
    heading: float,
    speed_knots: float,
    dt_hours: float,
    n_particles: int = 1000,
) -> ParticleCloud:
    headings = np.random.normal(heading, 30.0, n_particles) % 360
    speeds = np.abs(np.random.normal(speed_knots, 3.0, n_particles))

    speed_deg_per_hour = speeds / 60.0
    heading_rad = np.deg2rad(headings)

    dlat = speed_deg_per_hour * np.cos(heading_rad) * dt_hours
    dlon = speed_deg_per_hour * np.sin(heading_rad) * dt_hours / np.cos(np.deg2rad(lat))

    lats = lat + dlat
    lons = lon + dlon
    weights = np.ones(n_particles) / n_particles

    return ParticleCloud(
        lats=lats.tolist(),
        lons=lons.tolist(),
        headings=headings.tolist(),
        speeds=speeds.tolist(),
        weights=weights.tolist(),
    )


def bayesian_update(
    cloud: ParticleCloud,
    obs_lat: float,
    obs_lon: float,
    obs_sigma: float = 0.01,
) -> ParticleCloud:
    lats = np.array(cloud["lats"])
    lons = np.array(cloud["lons"])
    weights = np.array(cloud["weights"])

    dist_sq = (lats - obs_lat) ** 2 + (lons - obs_lon) ** 2
    likelihood = np.exp(-dist_sq / (2 * obs_sigma**2))

    weights *= likelihood
    total = weights.sum()
    if total < 1e-300:
        weights = np.ones_like(weights) / len(weights)
    else:
        weights /= total

    n = len(weights)
    indices = np.random.choice(n, size=n, replace=True, p=weights)

    return ParticleCloud(
        lats=lats[indices].tolist(),
        lons=lons[indices].tolist(),
        headings=np.array(cloud["headings"])[indices].tolist(),
        speeds=np.array(cloud["speeds"])[indices].tolist(),
        weights=(np.ones(n) / n).tolist(),
    )


def _entropy(weights: NDArray) -> float:
    w = weights[weights > 0]
    return -float(np.sum(w * np.log(w)))


def _conformal_region(lats: NDArray, lons: NDArray, weights: NDArray, level: float = 0.9) -> dict:
    sorted_idx = np.argsort(weights)[::-1]
    cumsum = np.cumsum(weights[sorted_idx])
    keep = sorted_idx[cumsum <= level]
    if len(keep) < 3:
        keep = sorted_idx[: max(3, int(len(sorted_idx) * level))]

    subset_lats = lats[keep]
    subset_lons = lons[keep]

    center_lat = float(np.mean(subset_lats))
    center_lon = float(np.mean(subset_lons))

    angles = np.arctan2(subset_lats - center_lat, subset_lons - center_lon)
    order = np.argsort(angles)
    hull_lats = subset_lats[order]
    hull_lons = subset_lons[order]

    n_points = min(32, len(hull_lats))
    step = max(1, len(hull_lats) // n_points)
    coords = [
        [float(hull_lons[i]), float(hull_lats[i])]
        for i in range(0, len(hull_lats), step)
    ]
    coords.append(coords[0])

    return {
        "type": "Feature",
        "properties": {"confidence": level},
        "geometry": {"type": "Polygon", "coordinates": [coords]},
    }


def recommend_sensor(
    cloud: ParticleCloud,
    candidate_sensors: list[dict] | None = None,
) -> Recommendation:
    lats = np.array(cloud["lats"])
    lons = np.array(cloud["lons"])
    weights = np.array(cloud["weights"])

    if candidate_sensors is None:
        center_lat = float(np.average(lats, weights=weights))
        center_lon = float(np.average(lons, weights=weights))
        offsets = [(0, 0), (0.05, 0), (-0.05, 0), (0, 0.05), (0, -0.05)]
        candidate_sensors = [
            {"sensor_id": f"SAR-{i}", "lat": center_lat + dlat, "lon": center_lon + dlon, "radius": 0.03}
            for i, (dlat, dlon) in enumerate(offsets)
        ]

    current_entropy = _entropy(weights)
    taskings: list[SensorTasking] = []

    for sensor in candidate_sensors:
        s_lat, s_lon, radius = sensor["lat"], sensor["lon"], sensor["radius"]
        dist = np.sqrt((lats - s_lat) ** 2 + (lons - s_lon) ** 2)
        in_view = dist < radius

        if in_view.sum() == 0:
            taskings.append(SensorTasking(
                sensor_id=sensor["sensor_id"],
                expected_entropy_reduction=0.0,
                center_lat=s_lat,
                center_lon=s_lon,
            ))
            continue

        w_in = weights[in_view].copy()
        w_in /= w_in.sum() if w_in.sum() > 0 else 1.0
        entropy_if_seen = _entropy(w_in)

        w_out = weights[~in_view].copy()
        if w_out.sum() > 0:
            w_out /= w_out.sum()
            entropy_if_not_seen = _entropy(w_out)
        else:
            entropy_if_not_seen = 0.0

        p_detect = float(weights[in_view].sum())
        expected_posterior_entropy = p_detect * entropy_if_seen + (1 - p_detect) * entropy_if_not_seen
        reduction = current_entropy - expected_posterior_entropy

        taskings.append(SensorTasking(
            sensor_id=sensor["sensor_id"],
            expected_entropy_reduction=float(reduction),
            center_lat=s_lat,
            center_lon=s_lon,
        ))

    taskings.sort(key=lambda t: t["expected_entropy_reduction"], reverse=True)
    region = _conformal_region(lats, lons, weights, level=0.9)

    return Recommendation(taskings=taskings, prediction_region=region)


if __name__ == "__main__":
    print("=== Engine Self-Test ===")

    cloud = particle_propagate(33.7, -118.2, heading=270.0, speed_knots=12.0, dt_hours=6.0)
    assert len(cloud["lats"]) == 1000
    assert abs(sum(cloud["weights"]) - 1.0) < 1e-6
    print(f"✓ particle_propagate: 1000 particles, mean lat={np.mean(cloud['lats']):.4f}")

    updated = bayesian_update(cloud, obs_lat=33.68, obs_lon=-118.35)
    assert len(updated["lats"]) == 1000
    assert abs(sum(updated["weights"]) - 1.0) < 1e-6
    spread_before = np.std(cloud["lats"])
    spread_after = np.std(updated["lats"])
    print(f"✓ bayesian_update: spread {spread_before:.4f} → {spread_after:.4f}")

    rec = recommend_sensor(updated)
    assert len(rec["taskings"]) == 5
    assert rec["prediction_region"]["geometry"]["type"] == "Polygon"
    print(f"✓ recommend_sensor: top={rec['taskings'][0]['sensor_id']} "
          f"ΔH={rec['taskings'][0]['expected_entropy_reduction']:.4f}")
    print(f"✓ prediction_region: {len(rec['prediction_region']['geometry']['coordinates'][0])} vertices")
    print("\nAll tests passed.")
