# Gundooo

A Vite + React command-and-control demo for maritime custody after AIS disappears.

## Demo Flow

1. Landing page: `A tanker goes AIS-dark. What do you task next?`
2. Theater selector: Strait of Hormuz sensor sandbox and Long Beach vessel watch
3. Hormuz mission: cached AIS-style exercise tracks, weather context, simulated sensor coverages, uncertainty region, sensor hit, and commander brief
4. Long Beach mission: local AIS replay backend for vessel profiles, dark-event triage, particle prediction, and sensor recommendation

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

Open the printed URL, usually `http://localhost:5173`. Routes use hash URLs so the static build works from any subdirectory, for example `/#/mission/strait-of-hormuz`.

## Build

```bash
npm run build
npm run preview
```

## Backend

The frontend works without the backend for the Hormuz exercise sandbox.

For the Long Beach replay backend:

```bash
cd backend
.venv/bin/python main.py
```

Then open `/#/mission/long-beach`.

## Data Provenance

The Hormuz demo is an exercise environment:

- AIS snapshot: cached AIS-style vessel tracks and last-known positions
- Weather: cached open-weather context for wind, visibility, cloud, and sea state
- Sensor actions: simulated SAR, coastal radar, UAV EO, ELINT, and patrol tasking
- Observation: simulated detection used to demonstrate Bayesian update / search-area reduction
- Prediction: model output and deterministic demo geometry

The Long Beach backend uses the local `backend/data/AIS_real.csv` replay dataset for vessel summaries and detected AIS gaps. Treat it as replay data, not a live feed.
