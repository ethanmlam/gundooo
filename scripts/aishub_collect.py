#!/usr/bin/env python3
"""Poll AISHub and write the same live AIS JSON schema used by the frontend.

Required env:
  AISHUB_USERNAME=<username from AISHub>

Optional env:
  AISHUB_AREA=hormuz|malacca|rotterdam|suez|custom
  AISHUB_BBOX=latmin,lonmin,latmax,lonmax  # only for custom

AISHub asks users not to call the webservice more than once per minute, so this
collector defaults to one poll every 65 seconds.
"""
import json
import os
import signal
import tempfile
import time
import urllib.parse
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_PATHS = [
    ROOT / "dist" / "data" / "live_ais_hormuz.json",
    ROOT / "public" / "data" / "live_ais_hormuz.json",
    Path("/home/opc/clawd/dashboard/gundooo/data/live_ais_hormuz.json"),
]

AREAS = {
    "hormuz": (25.4, 55.0, 27.3, 57.7),
    "malacca": (0.5, 98.0, 4.5, 105.5),
    "rotterdam": (50.5, 2.0, 54.5, 8.0),
    "suez": (29.0, 31.0, 36.5, 36.8),
}
POLL_SECONDS = 65
MAX_TRACK_POINTS = 16
vessels = {}
running = True
poll_count = 0
last_error = None


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_bbox():
    area = os.environ.get("AISHUB_AREA", "hormuz").lower()
    if area == "custom":
        raw = os.environ.get("AISHUB_BBOX", "")
        parts = [float(x.strip()) for x in raw.split(",")]
        if len(parts) != 4:
            raise SystemExit("AISHUB_BBOX must be latmin,lonmin,latmax,lonmax")
        return tuple(parts), area
    if area not in AREAS:
        raise SystemExit(f"Unknown AISHUB_AREA {area}. Use one of {sorted(AREAS)} or custom.")
    return AREAS[area], area


def atomic_write(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name, dir=path.parent)
    with os.fdopen(fd, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    os.replace(tmp, path)


def snapshot(status="live"):
    ordered = sorted(vessels.values(), key=lambda v: v.get("lastSeen", ""), reverse=True)
    bbox, area = get_bbox()
    latmin, lonmin, latmax, lonmax = bbox
    return {
        "status": status,
        "source": "AISHub",
        "area": area,
        "updatedAt": now_iso(),
        "messageCount": poll_count,
        "vesselCount": len(ordered),
        "lastError": last_error,
        "bbox": [[latmin, lonmin], [latmax, lonmax]],
        "vessels": ordered[:500],
    }


def write_snapshot(status="live"):
    payload = snapshot(status)
    for path in OUT_PATHS:
        try:
            atomic_write(path, payload)
        except Exception:
            pass


def normalize_payload(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("vessels"), list):
            return payload["vessels"]
        if isinstance(payload.get("Vessels"), list):
            return payload["Vessels"]
        if "MMSI" in payload:
            return [payload]
    return []


def clean_number(value):
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except Exception:
        return None


def update_vessel(row):
    mmsi = str(row.get("MMSI") or row.get("mmsi") or "").strip()
    if not mmsi:
        return
    lat = clean_number(row.get("LATITUDE") or row.get("latitude"))
    lng = clean_number(row.get("LONGITUDE") or row.get("longitude"))
    if lat is None or lng is None:
        return

    existing = vessels.get(mmsi, {"track": deque(maxlen=MAX_TRACK_POINTS)})
    track = existing.get("track")
    if not isinstance(track, deque):
        track = deque(track, maxlen=MAX_TRACK_POINTS)
    point = [round(lng, 5), round(lat, 5)]
    if not track or track[-1] != point:
        track.append(point)

    sog = clean_number(row.get("SOG"))
    cog = clean_number(row.get("COG"))
    heading = clean_number(row.get("HEADING"))
    name = str(row.get("NAME") or row.get("ShipName") or "").strip()
    timestamp = row.get("TIME") or row.get("TSTAMP") or now_iso()

    vessels[mmsi] = {
        "mmsi": mmsi,
        "name": name,
        "lat": point[1],
        "lng": point[0],
        "sog": sog,
        "cog": cog,
        "heading": heading,
        "navStatus": row.get("NAVSTAT"),
        "lastSeen": timestamp,
        "track": list(track),
        "label": name or mmsi,
        "type": row.get("TYPE"),
        "destination": row.get("DEST"),
    }


def poll_once():
    global poll_count, last_error
    username = os.environ.get("AISHUB_USERNAME")
    if not username:
        raise SystemExit("AISHUB_USERNAME missing")
    latmin, lonmin, latmax, lonmax = get_bbox()[0]
    params = {
        "username": username,
        "format": 1,
        "output": "json",
        "compress": 0,
        "latmin": latmin,
        "latmax": latmax,
        "lonmin": lonmin,
        "lonmax": lonmax,
        "interval": 30,
    }
    url = "https://data.aishub.net/ws.php?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=25) as response:
        raw = response.read().decode("utf-8", errors="replace").strip()
    if not raw:
        last_error = "empty response, possible rate limit or no data"
        return 0
    data = json.loads(raw)
    rows = normalize_payload(data)
    for row in rows:
        update_vessel(row)
    poll_count += len(rows)
    last_error = None
    return len(rows)


def stop(*_):
    global running
    running = False
    write_snapshot("stopped")


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while running:
        try:
            write_snapshot("polling")
            count = poll_once()
            write_snapshot("live")
            print(f"{now_iso()} AISHub poll ok: {count} rows", flush=True)
        except Exception as exc:
            last_error = str(exc)
            write_snapshot("error")
            print(f"{now_iso()} AISHub poll error: {exc}", flush=True)
        for _ in range(POLL_SECONDS):
            if not running:
                break
            time.sleep(1)
