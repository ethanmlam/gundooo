from __future__ import annotations

from typing import TypedDict

from intent import classify_intent

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


def triage_dark_events(
    dark_events: list[dict],
    all_vessels: list[dict],
    vessel_map: dict[int, dict],
) -> list[TriageEntry]:
    results: list[TriageEntry] = []

    for event in dark_events:
        mmsi = event["mmsi"]
        vessel = vessel_map.get(mmsi)
        if not vessel or len(vessel["track"]) < 2:
            continue

        intent_result = classify_intent(vessel["track"], all_vessels, dark_events, mmsi)

        intent_s = INTENT_SCORES.get(intent_result["intent"], 5)
        duration_s = _duration_score(event["duration_hours"])
        speed_s = _speed_score(event["last_known_speed"])
        type_s = _vessel_type_score(event["vessel_type"])
        flag_s, flag_reason = _flag_score(mmsi)

        threat_score = min(intent_s + duration_s + speed_s + type_s + flag_s, 100)

        parts = [
            f"intent={intent_result['intent']}(+{intent_s})",
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
