# Gundo

Maritime dark-vessel triage and sensor allocation.

Demo video: https://youtu.be/OCDcDUJsYbs

140 vessels went dark off Long Beach. A collection manager has three sensors and 140 targets. Gundo ranks which vessel matters, predicts where it went, and recommends which sensor to point next.

## What It Does

**Triage:** Scores every dark event by duration, speed deviation, flag state, lane departure, and behavior. Turns 140 dark vessels into a prioritized watchlist.

**Intent classification:** Classifies each gap as evasion, loitering, rendezvous, anchoring, or normal transit. Uses speed variance, heading variance, lane deviation, and vessel proximity, not just gap length.

**Position prediction:** Propagates 1,000 particles from last known heading, speed, and location. Weights them by navigable water, ocean boundaries, and shipping-lane proximity. Wraps the result in a 90% conformal search polygon.

**Sensor recommendation:** Ranks SAR spotlight, SAR stripmap, ELINT, and OPIR by expected information gain. The question is simple: which pass reduces uncertainty the most?

**Bayesian updating:** Reweights and resamples the particle cloud after a sensor observation. In the demo, one SAR pass collapses the 90% search area by about 90%.

**Multi-vessel allocation:** Assigns limited sensor passes across high-priority vessels. Greedy allocation by expected entropy reduction, constrained by available passes.

## Architecture

React + deck.gl + MapLibre frontend. FastAPI + NumPy backend.

Endpoints: `/vessels`, `/dark-events`, `/triage`, `/predict`, `/update`, `/recommend/{mmsi}`, `/intent/{mmsi}`, `/search-loop/{mmsi}`, `/allocate`.

**Frontend:** React 19, Vite, deck.gl, MapLibre, Zustand, TanStack Query, Recharts, Framer Motion.

**Backend:** Python, FastAPI, NumPy, pandas, scikit-learn, Shapely, sgp4.

**Data:** Real AIS data from NOAA MarineCadastre for Long Beach, January 15-17, 2025. The dataset contains 607 vessels and 140 dark events detected with a 4-hour gap threshold.

## Algorithms

| Component | Method | Key detail |
|---|---|---|
| Position prediction | Particle filter | 1,000 particles, heading noise at 20 degrees, speed noise at 16%, ocean mask, shipping-lane bias |
| Search area | Conformal prediction | Weighted 90% coverage polygon |
| Sensor update | Bayesian reweighting + resampling | Gaussian likelihood, systematic resampling |
| Sensor selection | Entropy optimization | Expected posterior entropy reduction per sensor, adjusted for weather |
| Threat triage | Logistic regression | Dark duration, speed, heading deviation, lane distance, flag risk |
| Intent classification | Rule-based kinematics | Speed variance, heading variance, speed change rate, lane deviation, vessel proximity |

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

Open `http://localhost:5173/#/mission/long-beach`.

## Data

AIS data is not included in the repo because it is 150MB+. Download it from MarineCadastre and place `AIS_real.csv` in `backend/data/`.

To generate the replay dataset:

```bash
python backend/build_long_beach_csv.py
```

Built at the 3rd Annual NatSec Hackathon, Shack15, San Francisco.
