from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from typing import TypedDict

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from intent import classify_intent

log = logging.getLogger(__name__)

_intent_pool = ThreadPoolExecutor(max_workers=1)


def _classify_intent_safe(track, all_vessels, dark_events, mmsi, timeout_sec=5):
    future = _intent_pool.submit(classify_intent, track, all_vessels, dark_events, mmsi)
    try:
        return future.result(timeout=timeout_sec)
    except FuturesTimeout:
        log.warning("intent timeout for MMSI %d after %ds, defaulting to normal_transit", mmsi, timeout_sec)
        return {"intent": "normal_transit", "confidence": 0.0, "reasoning": "timeout", "features": {}}
    except Exception as exc:
        log.warning("intent error for MMSI %d: %s, defaulting to normal_transit", mmsi, exc)
        return {"intent": "normal_transit", "confidence": 0.0, "reasoning": f"error: {exc}", "features": {}}

US_MIDS = {"303", "338", "366", "367", "368", "369"}

INTENT_SCORES = {
    "evasion": 30,
    "loitering": 25,
    "rendezvous": 15,
    "normal_transit": 5,
    "anchoring": 0,
}

VESSEL_TYPE_SCORES = {
    "cargo": 15, "cargo_hazardous_a": 15, "cargo_hazardous_b": 15,
    "tanker": 15, "tanker_hazardous_a": 15, "tanker_hazardous_b": 15, "tanker_other": 15,
    "fishing": 10,
    "high_speed_craft": 8, "towing": 8, "towing_large": 8, "tug": 8,
    "dredging": 6, "other": 6, "diving_ops": 6,
    "passenger": 5, "pilot": 5, "port_tender": 5,
    "pleasure_craft": 3, "sailing": 3,
    "military": 2, "law_enforcement": 2, "sar": 2,
}

MAX_DURATION_HOURS = 48.0
MAX_SPEED_KNOTS = 20.0

# Module-level model state populated by triage_dark_events
_trained_model: LogisticRegression | None = None
_trained_scaler: StandardScaler | None = None
_feature_names: list[str] | None = None
_training_samples: int = 0
_positive_samples: int = 0


class TriageEntry(TypedDict):
    mmsi: int
    vessel_name: str
    vessel_type: str
    threat_score: int
    intent: str
    intent_confidence: float
    dark_duration_hours: float
    reasoning: str


def _flag_score(mmsi: int) -> tuple[int, str]:
    mid = str(mmsi)[:3]
    if mid in US_MIDS:
        return 0, "US-flagged"
    return 10, f"non-US flag (MID {mid})"


def _duration_score(hours: float) -> int:
    return round(25 * min(hours / MAX_DURATION_HOURS, 1.0))


def _speed_score(speed_knots: float) -> int:
    return round(20 * min(speed_knots / MAX_SPEED_KNOTS, 1.0))


def _vessel_type_score(vessel_type: str) -> int:
    return VESSEL_TYPE_SCORES.get(vessel_type, 6)


def _extract_features(
    event: dict,
    all_vessels: list[dict],
    dark_events: list[dict],
    vessel_map: dict[int, dict],
    intent_cache: dict[int, dict] | None = None,
) -> tuple[list[float], str, dict] | None:
    """Compute the 5-feature vector for a dark event. Returns (features, intent, intent_result) or None."""
    mmsi = event["mmsi"]
    vessel = vessel_map.get(mmsi)
    if not vessel or len(vessel["track"]) < 2:
        return None

    if intent_cache is not None and mmsi in intent_cache:
        intent_result = intent_cache[mmsi]
    else:
        intent_result = _classify_intent_safe(vessel["track"], all_vessels, dark_events, mmsi)
        if intent_cache is not None:
            intent_cache[mmsi] = intent_result

    intent = intent_result["intent"]

    intent_score = float(INTENT_SCORES.get(intent, 5))
    duration_hours = float(event["duration_hours"])
    last_known_speed = float(event["last_known_speed"])
    vessel_type_code = float(VESSEL_TYPE_SCORES.get(event["vessel_type"], 6))
    mid = str(mmsi)[:3]
    flag_foreign = 0.0 if mid in US_MIDS else 1.0

    features = [intent_score, duration_hours, last_known_speed, vessel_type_code, flag_foreign]
    return features, intent, intent_result


def _build_model(
    dark_events: list[dict],
    all_vessels: list[dict],
    vessel_map: dict[int, dict],
    intent_cache: dict[int, dict] | None = None,
) -> tuple[LogisticRegression, StandardScaler, list[str]] | None:
    """Train a logistic regression model on synthetic labels derived from dark_events."""
    if len(dark_events) < 5:
        return None

    total = len(dark_events)
    feature_rows: list[list[float]] = []
    labels: list[int] = []

    for idx, event in enumerate(dark_events):
        log.info("training: scoring vessel %d/%d (MMSI %d)", idx + 1, total, event["mmsi"])
        result = _extract_features(event, all_vessels, dark_events, vessel_map, intent_cache)
        if result is None:
            continue
        features, intent, _ = result
        duration_hours = features[1]
        last_known_speed = features[2]
        suspicious = (
            intent in ("evasion", "rendezvous")
            or (duration_hours > 12.0 and last_known_speed > 8.0)
        )
        feature_rows.append(features)
        labels.append(int(suspicious))

    if len(feature_rows) < 5:
        return None

    X = np.array(feature_rows)
    y = np.array(labels)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = LogisticRegression(class_weight="balanced", max_iter=1000)
    model.fit(X_scaled, y)

    feature_names = [
        "intent_score",
        "duration_hours",
        "last_known_speed",
        "vessel_type_code",
        "flag_foreign",
    ]

    return model, scaler, feature_names


def triage_dark_events(
    dark_events: list[dict],
    all_vessels: list[dict],
    vessel_map: dict[int, dict],
) -> list[TriageEntry]:
    global _trained_model, _trained_scaler, _feature_names, _training_samples, _positive_samples

    intent_cache: dict[int, dict] = {}
    total = len(dark_events)
    log.info("triage: starting for %d dark events", total)

    model_result = _build_model(dark_events, all_vessels, vessel_map, intent_cache)

    if model_result is not None:
        model, scaler, feature_names = model_result
        _trained_model = model
        _trained_scaler = scaler
        _feature_names = feature_names

        # Count training sample stats for get_model_weights() — reuses cache, no recomputation
        sample_labels: list[int] = []
        for event in dark_events:
            result = _extract_features(event, all_vessels, dark_events, vessel_map, intent_cache)
            if result is None:
                continue
            features, intent, _ = result
            suspicious = (
                intent in ("evasion", "rendezvous")
                or (features[1] > 12.0 and features[2] > 8.0)
            )
            sample_labels.append(int(suspicious))

        _training_samples = len(sample_labels)
        _positive_samples = sum(sample_labels)
        log.info("triage: model trained, %d samples, %d positive", _training_samples, _positive_samples)

    results: list[TriageEntry] = []

    for idx, event in enumerate(dark_events):
        mmsi = event["mmsi"]
        vessel = vessel_map.get(mmsi)
        if not vessel or len(vessel["track"]) < 2:
            continue

        log.info("triage: scoring vessel %d/%d (MMSI %d)", idx + 1, total, mmsi)

        if model_result is not None:
            feat_result = _extract_features(event, all_vessels, dark_events, vessel_map, intent_cache)
            if feat_result is not None:
                features, intent, intent_result = feat_result
                proba = model.predict_proba(scaler.transform([features]))[0][1]
                threat_score = int(round(proba * 100))

                parts = [
                    f"model_proba={proba:.3f}",
                    f"intent={intent}(score={int(features[0])})",
                    f"dark={features[1]:.1f}h",
                    f"speed={features[2]:.1f}kn",
                    f"type_code={int(features[3])}",
                    f"flag_foreign={int(features[4])}",
                ]
            else:
                continue
            intent_result = intent_cache.get(mmsi, {"intent": "normal_transit", "confidence": 0.0})
        else:
            intent_result = intent_cache.get(mmsi)
            if not intent_result:
                intent_result = _classify_intent_safe(vessel["track"], all_vessels, dark_events, mmsi)
                intent_cache[mmsi] = intent_result
            intent = intent_result["intent"]
            intent_s = INTENT_SCORES.get(intent, 5)
            duration_s = _duration_score(event["duration_hours"])
            speed_s = _speed_score(event["last_known_speed"])
            type_s = _vessel_type_score(event["vessel_type"])
            flag_s, flag_reason = _flag_score(mmsi)

            threat_score = min(intent_s + duration_s + speed_s + type_s + flag_s, 100)

            parts = [
                f"intent={intent}(+{intent_s})",
                f"dark={event['duration_hours']:.1f}h(+{duration_s})",
                f"speed={event['last_known_speed']:.1f}kn(+{speed_s})",
                f"type={event['vessel_type']}(+{type_s})",
                f"flag={flag_reason}(+{flag_s})",
            ]

        results.append(TriageEntry(
            mmsi=mmsi,
            vessel_name=event["vessel_name"],
            vessel_type=event["vessel_type"],
            threat_score=threat_score,
            intent=intent_result["intent"],
            intent_confidence=intent_result["confidence"],
            dark_duration_hours=event["duration_hours"],
            reasoning=" | ".join(parts),
        ))

    results.sort(key=lambda r: r["threat_score"], reverse=True)
    return results


def retrain_with_fusion(
    dark_events: list[dict],
    all_vessels: list[dict],
    vessel_map: dict[int, dict],
    fusion_func,
) -> dict | None:
    """Retrain the logistic regression using fusion-derived labels instead of synthetic rules.

    fusion_func: callable (mmsi: int) -> dict with at least "fused_threat_belief" key, or None.
    Falls back to synthetic labels when fusion_func fails for a given vessel.
    """
    global _trained_model, _trained_scaler, _feature_names, _training_samples, _positive_samples

    if len(dark_events) < 5:
        return None

    intent_cache: dict[int, dict] = {}
    feature_rows: list[list[float]] = []
    labels: list[int] = []

    for event in dark_events:
        mmsi = event["mmsi"]
        result = _extract_features(event, all_vessels, dark_events, vessel_map, intent_cache)
        if result is None:
            continue
        features, intent, _ = result

        # Try fusion-derived label first
        label = None
        try:
            if fusion_func is not None:
                fusion_result = fusion_func(mmsi)
                if fusion_result is not None and "fused_threat_belief" in fusion_result:
                    label = int(fusion_result["fused_threat_belief"] > 0.5)
        except Exception as exc:
            log.warning("fusion label failed for MMSI %d: %s, using synthetic", mmsi, exc)

        # Fall back to synthetic label
        if label is None:
            duration_hours = features[1]
            last_known_speed = features[2]
            suspicious = (
                intent in ("evasion", "rendezvous")
                or (duration_hours > 12.0 and last_known_speed > 8.0)
            )
            label = int(suspicious)

        feature_rows.append(features)
        labels.append(label)

    if len(feature_rows) < 5:
        return None

    X = np.array(feature_rows)
    y = np.array(labels)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = LogisticRegression(class_weight="balanced", max_iter=1000)
    model.fit(X_scaled, y)

    feature_names = [
        "intent_score",
        "duration_hours",
        "last_known_speed",
        "vessel_type_code",
        "flag_foreign",
    ]

    _trained_model = model
    _trained_scaler = scaler
    _feature_names = feature_names
    _training_samples = len(labels)
    _positive_samples = sum(labels)

    log.info("retrain_with_fusion: %d samples, %d positive", _training_samples, _positive_samples)

    return get_model_weights()


def get_model_weights() -> dict | None:
    """Return logistic regression coefficients and metadata, or None if not yet trained."""
    if _trained_model is None or _feature_names is None:
        return None
    return {
        "feature_names": _feature_names,
        "coefficients": dict(zip(_feature_names, _trained_model.coef_[0].tolist())),
        "intercept": float(_trained_model.intercept_[0]),
        "training_samples": _training_samples,
        "positive_samples": _positive_samples,
    }
