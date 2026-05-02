# Gundooo

A Vite + React live OSINT world model demo for theater-level maritime and air-domain anomaly detection.

## Flow

1. Landing page: `Gundooo: Live OSINT World Model`
2. Globe theater selector: South China Sea, Taiwan Strait, Persian Gulf, Baltic Sea, Red Sea
3. Mission watchfloor: tactical map, anomaly queue, natural language tasking, feed status, charts, and 3D operational workbench

## Stack

- React 19 + Vite
- React Router
- react-globe.gl
- deck.gl + MapLibre
- Three.js / React Three Fiber
- Recharts
- Framer Motion
- Lucide icons
- Zustand
- TanStack Query
- Turf.js ready for geospatial ops

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL, usually `http://localhost:5173`. Routes use hash URLs so the static build works from any subdirectory, for example `/#/mission/south-china-sea`.

## Build

```bash
npm run build
npm run preview
```

## Data note

This is a front-end-first demo with deterministic mock feeds. It is structured so real connectors can replace the mock data later:

- AIS for vessels
- ADS-B for aircraft
- synthetic radar detections
- weather / cloud cover
- OSINT incident feeds

The South China Sea mission is the wired demo scenario.
