#!/usr/bin/env python3
import asyncio
import json
import os
import signal
import tempfile
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import websockets

ROOT = Path(__file__).resolve().parents[1]
OUT_PATHS = [
    ROOT / "dist" / "data" / "live_ais_hormuz.json",
    ROOT / "public" / "data" / "live_ais_hormuz.json",
    Path("/home/opc/clawd/dashboard/gundooo/data/live_ais_hormuz.json"),
]
BBOX = [[[25.4, 55.0], [27.3, 57.7]]]
MAX_TRACK_POINTS = 24
WRITE_INTERVAL_SECONDS = 1.5

vessels = {}
message_count = 0
last_write = 0.0
running = True


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_write(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name, dir=path.parent)
    with os.fdopen(fd, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    os.replace(tmp, path)


def snapshot(status="live"):
    ordered = sorted(vessels.values(), key=lambda v: v.get("lastSeen", ""), reverse=True)
    return {
        "status": status,
        "updatedAt": now_iso(),
        "messageCount": message_count,
        "vesselCount": len(ordered),
        "bbox": BBOX[0],
        "vessels": ordered[:500],
    }


def write_snapshot(status="live"):
    payload = snapshot(status)
    for path in OUT_PATHS:
        try:
            atomic_write(path, payload)
        except Exception:
            pass


def get_position(message):
    meta = message.get("MetaData") or message.get("Metadata") or {}
    body = message.get("Message", {}).get("PositionReport", {})
    lat = body.get("Latitude", body.get("latitude", meta.get("Latitude", meta.get("latitude"))))
    lng = body.get("Longitude", body.get("longitude", meta.get("Longitude", meta.get("longitude"))))
    return lat, lng, meta, body


def update_vessel(message):
    global message_count, last_write
    if message.get("MessageType") != "PositionReport":
        return
    lat, lng, meta, body = get_position(message)
    if lat is None or lng is None:
        return
    mmsi = str(body.get("UserID") or body.get("userID") or meta.get("MMSI") or meta.get("MMSI_String") or meta.get("ShipMMSI") or "unknown")
    if mmsi == "unknown":
        return

    existing = vessels.get(mmsi, {"track": deque(maxlen=MAX_TRACK_POINTS)})
    track = existing.get("track")
    if not isinstance(track, deque):
        track = deque(track, maxlen=MAX_TRACK_POINTS)
    point = [round(float(lng), 5), round(float(lat), 5)]
    if not track or track[-1] != point:
        track.append(point)

    sog = body.get("Sog")
    cog = body.get("Cog")
    name = str(meta.get("ShipName") or meta.get("ship_name") or meta.get("Name") or "").strip()
    vessels[mmsi] = {
        "mmsi": mmsi,
        "name": name,
        "lat": point[1],
        "lng": point[0],
        "sog": sog,
        "cog": cog,
        "heading": body.get("TrueHeading"),
        "navStatus": body.get("NavigationalStatus"),
        "lastSeen": now_iso(),
        "track": list(track),
        "label": name or mmsi,
    }
    message_count += 1


async def connect():
    api_key = os.environ.get("AISSTREAM_API_KEY")
    if not api_key:
        raise SystemExit("AISSTREAM_API_KEY missing")

    subscription = {
        "APIKey": api_key,
        "BoundingBoxes": BBOX,
        "FilterMessageTypes": ["PositionReport"],
    }

    backoff = 2
    while running:
        try:
            write_snapshot("connecting")
            async with websockets.connect("wss://stream.aisstream.io/v0/stream", ping_interval=20, ping_timeout=20) as websocket:
                await websocket.send(json.dumps(subscription))
                write_snapshot("live")
                backoff = 2
                async for raw in websocket:
                    try:
                        update_vessel(json.loads(raw))
                    except Exception:
                        continue
                    loop_time = asyncio.get_running_loop().time()
                    global last_write
                    if loop_time - last_write >= WRITE_INTERVAL_SECONDS:
                        write_snapshot("live")
                        last_write = loop_time
        except Exception:
            write_snapshot("reconnecting")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 1.5, 30)


def stop(*_):
    global running
    running = False
    write_snapshot("stopped")


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    asyncio.run(connect())
