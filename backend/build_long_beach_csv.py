#!/usr/bin/env python3
from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

import zstandard as zstd

SRC_DIR = Path('/home/opc/clawd/data/ais/noaa-2025')
OUT = Path(__file__).resolve().parent / 'data' / 'AIS_real.csv'
FILES = [
    SRC_DIR / 'ais-2025-12-29.csv.zst',
    SRC_DIR / 'ais-2025-12-30.csv.zst',
    SRC_DIR / 'ais-2025-12-31.csv.zst',
]
# LA / Long Beach Harbor and immediate approaches
LON_MIN, LAT_MIN, LON_MAX, LAT_MAX = -118.36, 33.62, -118.02, 33.88
MAX_ROWS_PER_REAL_MMSI = 220
MAX_REAL_VESSELS = 280

FIELDNAMES = [
    'MMSI', 'BaseDateTime', 'LAT', 'LON', 'SOG', 'COG', 'Heading',
    'VesselName', 'IMO', 'CallSign', 'VesselType', 'Status', 'Length',
    'Width', 'Draft', 'Cargo', 'TransceiverClass'
]


def in_bbox(row: dict) -> bool:
    try:
        lon = float(row['longitude'])
        lat = float(row['latitude'])
    except Exception:
        return False
    return LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX


def convert(row: dict, *, mmsi: str | None = None, name: str | None = None) -> dict:
    return {
        'MMSI': mmsi or row.get('mmsi', ''),
        'BaseDateTime': row.get('base_date_time', ''),
        'LAT': row.get('latitude', ''),
        'LON': row.get('longitude', ''),
        'SOG': row.get('sog', ''),
        'COG': row.get('cog', ''),
        'Heading': row.get('heading', ''),
        'VesselName': name or row.get('vessel_name', ''),
        'IMO': row.get('imo', ''),
        'CallSign': row.get('call_sign', ''),
        'VesselType': row.get('vessel_type', ''),
        'Status': row.get('status', ''),
        'Length': row.get('length', ''),
        'Width': row.get('width', ''),
        'Draft': row.get('draft', ''),
        'Cargo': row.get('cargo', ''),
        'TransceiverClass': row.get('transceiver', ''),
    }


def iter_rows(path: Path):
    with path.open('rb') as fh:
        stream = zstd.ZstdDecompressor().stream_reader(fh)
        text = ''
        header = None
        while True:
            chunk = stream.read(4 * 1024 * 1024)
            if not chunk:
                break
            text += chunk.decode('utf-8', errors='ignore')
            lines = text.splitlines()
            if not text.endswith('\n') and lines:
                text = lines.pop()
            else:
                text = ''
            if header is None and lines:
                header = next(csv.reader([lines.pop(0)]))
            if header and lines:
                yield from csv.DictReader(lines, fieldnames=header)


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    per_mmsi: dict[str, list[dict]] = defaultdict(list)
    for path in FILES:
        if not path.exists():
            raise SystemExit(f'missing {path}')
        print(f'scanning {path.name}', flush=True)
        for row in iter_rows(path):
            if not in_bbox(row):
                continue
            mmsi = row.get('mmsi', '')
            if not mmsi:
                continue
            bucket = per_mmsi[mmsi]
            if len(bucket) < MAX_ROWS_PER_REAL_MMSI:
                bucket.append(convert(row))

    # Prefer commercial/operational vessels, then cap for frontend/backend speed.
    preferred = []
    others = []
    for mmsi, rows in per_mmsi.items():
        vtype = rows[0].get('VesselType') or ''
        target = preferred if vtype.startswith(('7', '8', '5', '3', '6')) else others
        target.append((mmsi, rows))
    selected = sorted(preferred, key=lambda item: len(item[1]), reverse=True)[:MAX_REAL_VESSELS]
    if len(selected) < MAX_REAL_VESSELS:
        selected += sorted(others, key=lambda item: len(item[1]), reverse=True)[:MAX_REAL_VESSELS - len(selected)]

    all_rows = []
    for _, rows in selected:
        # Downsample per vessel by keeping every nth row while preserving time order.
        rows = sorted(rows, key=lambda r: r['BaseDateTime'])
        step = max(1, len(rows) // 80)
        all_rows.extend(rows[::step][:100])

    # Ensure the demo/default MMSI exists. Use a real tanker/cargo track but rename it.
    source = next((rows for _, rows in selected if (rows[0].get('VesselType') or '').startswith(('8', '7')) and len(rows) >= 12), selected[0][1])
    source = sorted(source, key=lambda r: r['BaseDateTime'])
    demo_rows = [convert({
        'mmsi': r['MMSI'], 'base_date_time': r['BaseDateTime'], 'latitude': r['LAT'], 'longitude': r['LON'],
        'sog': r['SOG'], 'cog': r['COG'], 'heading': r['Heading'], 'vessel_name': r['VesselName'],
        'imo': r['IMO'], 'call_sign': r['CallSign'], 'vessel_type': r['VesselType'], 'status': r['Status'],
        'length': r['Length'], 'width': r['Width'], 'draft': r['Draft'], 'cargo': r['Cargo'], 'transceiver': r['TransceiverClass'],
    }, mmsi='309253000', name='GRACEFUL LEADER') for r in source[::max(1, len(source)//28)][:30]]
    # Force a dark gap by removing middle timestamps from the default vessel path. The backend
    # detects gaps by elapsed time between remaining consecutive points.
    all_rows.extend(demo_rows[:10] + demo_rows[20:])

    all_rows.sort(key=lambda r: (int(r['MMSI']) if str(r['MMSI']).isdigit() else 0, r['BaseDateTime']))
    with OUT.open('w', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_rows)
    print(f'wrote {OUT} rows={len(all_rows)} vessels={len(set(r["MMSI"] for r in all_rows))}', flush=True)


if __name__ == '__main__':
    build()
