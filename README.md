# Gundo

Maritime dark vessel triage and sensor allocation system.

140 vessels went dark off Long Beach. A collection manager has three sensors and 140 targets. Gundo ranks which vessel to care about, predicts where it went, and recommends which sensor to point at it.

## What it does

**Triage**: Scores every dark event by duration, speed deviation, flag state, lane departure, and behavior. Ranks 140 dark vessels into a prioritized watchlist.

**Intent classification**: Classifies why a vessel went dark: evasion, loitering, rendezvous, anchoring, or normal transit. Uses kinematic features (speed variance, heading variance, lane deviation, proximity to other vessels) not just gap duration.

**Position prediction**: Particle filter propagates 1,000 possible positions from last known state (heading, speed, location). Particles are weighted by navigable water boundaries, shipping lane proximity, and ocean constraints. Conformal prediction draws a 90% confidence polygon around the most likely search area.

**Sensor recommendation**: Entropy-based optimization across a catalog of sensor types (SAR spotlight, SAR stripmap, ELINT, OPIR). Ranks sensors by expected information gain — which sensor pass will reduce positional uncertainty the most. Accounts for weather degradation.

**Bayesian updating**: After a sensor pass, the particle cloud is reweighted using the observation likelihood. Resampling collapses the search area. In the demo, a single SAR pass reduces the 90% confidence polygon by ~90%.

**Multi-vessel allocation**: Given a sensor budget (N passes across M sensor types) and K prioritized targets, computes the optimal assignment of sensors to vessels. Greedy allocation by expected entropy reduction, constrained by available passes.

## Architecture

React + deck.gl + MapLibre (frontend) → FastAPI + NumPy (backend)

Endpoints: /vessels, /dark-events, /triage, /predict, /update, /recommend/{mmsi}, /intent/{mmsi}, /search-loop/{mmsi}, /allocate

**Frontend:** React 19, Vite, deck.gl, MapLibre, Zustand, TanStack Query, Recharts, Framer Motion

**Backend:** Python, FastAPI, NumPy, pandas, scikit-learn, Shapely, sgp4

**Data:** Real AIS data from NOAA MarineCadastre (Long Beach, Jan 15–17, 2025). 607 vessels, 140 dark events detected using a 4-hour gap threshold.

## Algorithms

| Component | Method | Key detail |
|---|---|---|
| Position prediction | Particle filter | 1,000 particles, Gaussian perturbation on heading (σ=20°) and speed (σ=16%), ocean mask, shipping lane bias |
| Search area | Conformal prediction | Weighted cumulative coverage at 90% level, convex hull boundary |
| Sensor update | Bayesian reweighting + resampling | Gaussian likelihood, systematic resampling |
| Sensor selection | Entropy-based optimization | Expected posterior entropy reduction per sensor, weather degradation factor |
| Threat triage | Logistic regression | Features: dark duration, speed, heading deviation, lane distance, flag risk. Optional Dempster-Shafer fusion retraining |
| Intent classification | Rule-based kinematic analysis | Speed variance, heading variance, speed change rate, lane deviation, vessel proximity |

## Running locally

**Backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

AIS data not included — download from [MarineCadastre](https://marinecadastre.gov/ais/) and place `AIS_real.csv` in `backend/data/`.

**Frontend:**

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and navigate to `/#/mission/long-beach`.

## Data

AIS data is not included in the repo (150MB+). Download from MarineCadastre (https://marinecadastre.gov/ais/) and run backend/build_long_beach_csv.py to generate the replay dataset.

Built at the 3rd Annual NatSec Hackathon, Shack15, San Francisco.
