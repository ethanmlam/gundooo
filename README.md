# Gundo

Maritime custody after AIS goes dark.

Demo: https://youtu.be/OCDcDUJsYbs

140 vessels went dark off Long Beach. A collection manager has three sensors and 140 targets. Gundo ranks which vessel matters, predicts where it likely went, and recommends the next sensor to task.

Built at the 3rd Annual NatSec Hackathon at Shack15, San Francisco.

## What It Proves

The hard part is not showing dots on a map. The hard part is keeping custody when the public signal disappears.

Gundo does five things:

- Detects AIS-dark events from real replay data
- Scores which dark vessels deserve attention first
- Predicts likely positions with a particle filter
- Draws a 90% conformal search area
- Chooses the sensor pass that reduces uncertainty the most

## Core Loop

1. A vessel stops broadcasting AIS.
2. Gundo scores the gap using duration, speed deviation, flag state, lane departure, and behavior.
3. It classifies the likely intent: evasion, loitering, rendezvous, anchoring, or normal transit.
4. It propagates 1,000 possible positions from last known heading, speed, and location.
5. It recommends SAR, ELINT, OPIR, or another sensor based on expected information gain.
6. After an observation, it reweights the particle cloud and shrinks the search area.

In the demo, one SAR pass collapses the 90% search polygon by about 90%.

## System

Frontend: React 19, Vite, deck.gl, MapLibre, Zustand, TanStack Query, Recharts, Framer Motion.

Backend: FastAPI, NumPy, pandas, scikit-learn, Shapely, sgp4.

Data: NOAA MarineCadastre AIS replay for Long Beach, January 15-17, 2025. The replay contains 607 vessels and 140 dark events using a 4-hour gap threshold.

Endpoints:

`/vessels`, `/dark-events`, `/triage`, `/predict`, `/update`, `/recommend/{mmsi}`, `/intent/{mmsi}`, `/search-loop/{mmsi}`, `/allocate`

## Algorithms

- Particle filter: 1,000 particles, heading noise, speed noise, ocean mask, shipping-lane bias
- Conformal prediction: weighted 90% search polygon
- Bayesian update: Gaussian likelihood and systematic resampling
- Sensor selection: expected posterior entropy reduction, adjusted for weather
- Threat triage: logistic regression over dark duration, speed, heading deviation, lane distance, and flag risk
- Intent classification: rule-based kinematics from speed variance, heading variance, lane deviation, and vessel proximity

## Run Locally

Backend:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Frontend:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173/#/mission/long-beach
```

## Data

AIS data is not committed because it is 150MB+. Download it from MarineCadastre and place `AIS_real.csv` in `backend/data/`.

To generate the replay dataset:

```bash
python backend/build_long_beach_csv.py
```
