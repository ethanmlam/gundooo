# Gundooo

A Vite + React command-and-control demo for maritime custody after AIS disappears.

## Demo Flow

1. Globe selector centered on Long Beach.
2. Long Beach mission: local AIS replay backend for vessel profiles, dark-event triage, particle prediction, and sensor recommendation.

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

Open the printed URL, usually `http://localhost:5173`. Routes use hash URLs so the static build works from any subdirectory, for example `/#/mission/long-beach`.

## Build

```bash
npm run build
npm run preview
```

## Backend

For the Long Beach replay backend:

```bash
cd backend
.venv/bin/python main.py
```

Then open `/#/mission/long-beach`.

## Data Provenance

The Long Beach backend uses the local `backend/data/AIS_real.csv` replay dataset for vessel summaries and detected AIS gaps. Treat it as replay data, not a live feed.
