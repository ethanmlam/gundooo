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


def _probably_water_socal(lat: NDArray, lon: NDArray) -> NDArray:
    """Conservative LA / Long Beach water mask for the replay demo.

    This avoids not only inland areas, but also most port/dock land. It keeps
    the open Pacific and the outer harbor/approach waters where a dark-vessel
    search cloud should plausibly live. It is intentionally stricter than a
    real coastline model because false land particles look bad in the demo.
    """
    # For the prediction demo, only allow open water outside the port. This is
    # intentionally stricter than reality because particles over container yards
    # or docks break trust immediately.
    offshore = (lat <= 33.70) & (lon <= -118.30)
    san_pedro_bay = (lat <= 33.735) & (lon <= -118.36)
    open_pacific = (lat <= 33.66) | (lon <= -118.48)
    return offshore | san_pedro_bay | open_pacific


def particle_propagate(
    lat: float,
    lon: float,
    heading: float,
    speed_knots: float,
    dt_hours: float,
    n_particles: int = 1000,
) -> ParticleCloud:
    # Oversample, then keep only plausible water points for the Long Beach
    # replay. This keeps the visual cloud from spilling over land while still
    # preserving stochastic uncertainty.
    pool = max(n_particles * 5, 2500)
    headings_all = np.random.normal(heading, 20.0, pool) % 360
    speeds_all = np.clip(np.random.normal(speed_knots, max(1.2, speed_knots * 0.16), pool), 0.2, None)

    speed_deg_per_hour = speeds_all / 60.0
    heading_rad = np.deg2rad(headings_all)

    dlat = speed_deg_per_hour * np.cos(heading_rad) * dt_hours
    dlon = speed_deg_per_hour * np.sin(heading_rad) * dt_hours / np.cos(np.deg2rad(lat))

    lats_all = lat + dlat
    lons_all = lon + dlon
    keep = _probably_water_socal(lats_all, lons_all)
    indices = np.where(keep)[0]
    if len(indices) < n_particles:
        # Fallback: take the most seaward points if the mask is too strict.
        seaward_score = (-lons_all) + np.maximum(0, 33.75 - lats_all)
        indices = np.argsort(seaward_score)[-n_particles:]
    else:
        indices = np.random.choice(indices, size=n_particles, replace=False)

    lats = lats_all[indices]
    lons = lons_all[indices]
    headings = headings_all[indices]
    speeds = speeds_all[indices]
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
        lat_std = max(float(np.std(lats)), 0.015)
        lon_std = max(float(np.std(lons)), 0.015)
        # Spread looks across the reachable cloud instead of stacking every SAR
        # candidate on the weighted mean. Offsets are in degrees, roughly
        # 1 degree latitude = 60 nm.
        offsets = [
            (0.0, 0.0),
            (0.75 * lat_std, 0.75 * lon_std),
            (-0.75 * lat_std, -0.75 * lon_std),
            (0.75 * lat_std, -0.75 * lon_std),
            (-0.75 * lat_std, 0.75 * lon_std),
        ]
        radius = max(0.025, min(0.08, 0.65 * max(lat_std, lon_std)))
        candidate_sensors = [
            {"sensor_id": f"SAR-{i}", "lat": center_lat + dlat, "lon": center_lon + dlon, "radius": radius}
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
