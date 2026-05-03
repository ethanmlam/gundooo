export type SensorKind = 'radar' | 'sar' | 'uav' | 'elint' | 'air';

export type SandboxSensor = {
  id: string;
  name: string;
  kind: SensorKind;
  status: 'simulated';
  coverage: number[][];
  center: [number, number];
  revisitMinutes: number;
  confidence: number;
  resolution: string;
  weatherSensitivity: 'low' | 'medium' | 'high';
  action: string;
  rationale: string;
  limitation: string;
};

export type SandboxWeather = {
  source: string;
  status: 'cached';
  observedAt: string;
  windKnots: number;
  visibilityKm: number;
  cloudCoverPct: number;
  seaState: string;
  effect: string;
};

export type SandboxTarget = {
  id: string;
  syntheticMmsi: number;
  vesselType: string;
  threatScore: number;
  darkStart: string;
  elapsedMinutes: number;
  lastAisPosition: [number, number];
  lastSpeedKnots: number;
  lastHeadingDeg: number;
  projectedTrack: number[][];
  predictionBefore: number[][];
  predictionAfter: number[][];
  evidence: string[];
};

export type SandboxObservation = {
  sensorId: string;
  observedAt: string;
  position: [number, number];
  confidence: number;
  label: string;
  areaReductionPct: number;
};

export type HormuzSensorSandbox = {
  target: SandboxTarget;
  sensors: SandboxSensor[];
  recommendedSensorId: string;
  observation: SandboxObservation;
  weather: SandboxWeather;
  sources: Array<{
    name: string;
    detail: string;
    status: 'cached' | 'simulated' | 'model';
  }>;
};

export const hormuzSensorSandbox: HormuzSensorSandbox = {
  target: {
    id: 'VLCC-381',
    syntheticMmsi: 309253000,
    vesselType: 'VLCC tanker',
    threatScore: 88,
    darkStart: '16:12Z',
    elapsedMinutes: 46,
    lastAisPosition: [56.7, 26.45],
    lastSpeedKnots: 9.6,
    lastHeadingDeg: 72,
    projectedTrack: [[56.7, 26.45], [56.86, 26.5], [57.05, 26.56], [57.28, 26.62]],
    predictionBefore: [[56.68, 26.43], [56.88, 26.34], [57.22, 26.42], [57.44, 26.58], [57.18, 26.76], [56.84, 26.67], [56.68, 26.43]],
    predictionAfter: [[56.96, 26.50], [57.08, 26.47], [57.22, 26.54], [57.17, 26.64], [57.00, 26.62], [56.96, 26.50]],
    evidence: [
      'AIS stopped after slowdown inside the traffic separation scheme',
      'Last heading carries the vessel east toward the chokepoint exit',
      'Large tanker signature makes SAR the highest-confidence first look',
      'Weather penalizes optical UAV search more than radar or SAR',
    ],
  },
  sensors: [
    {
      id: 'SAR-WIDE',
      name: 'SAR wide-area stripmap',
      kind: 'sar',
      status: 'simulated',
      coverage: [[56.82, 26.28], [57.46, 26.40], [57.36, 26.78], [56.72, 26.66], [56.82, 26.28]],
      center: [57.08, 26.55],
      revisitMinutes: 92,
      confidence: 82,
      resolution: '5 m',
      weatherSensitivity: 'low',
      action: 'Task SAR stripmap over the projected exit corridor',
      rationale: 'Best first action because it can search through cloud and haze for a large tanker-sized contact.',
      limitation: 'Slower revisit; needs follow-on cueing to maintain continuous custody.',
    },
    {
      id: 'COASTAL-RADAR',
      name: 'Coastal surface radar',
      kind: 'radar',
      status: 'simulated',
      coverage: [[56.08, 26.02], [57.34, 26.80], [57.16, 25.80], [56.08, 26.02]],
      center: [56.72, 26.28],
      revisitMinutes: 5,
      confidence: 68,
      resolution: 'track-level',
      weatherSensitivity: 'low',
      action: 'Hold coastal radar on the lane merge',
      rationale: 'Good persistent watch near the chokepoint, especially if the vessel re-enters radar line of sight.',
      limitation: 'Shoreline clutter and geometry reduce confidence outside the lane merge.',
    },
    {
      id: 'UAV-EO',
      name: 'UAV electro-optical sweep',
      kind: 'uav',
      status: 'simulated',
      coverage: [[56.88, 26.40], [57.20, 26.46], [57.18, 26.64], [56.86, 26.60], [56.88, 26.40]],
      center: [57.02, 26.53],
      revisitMinutes: 35,
      confidence: 59,
      resolution: 'sub-meter',
      weatherSensitivity: 'high',
      action: 'Cue UAV EO after SAR narrows the box',
      rationale: 'Useful for identification once the search area is smaller.',
      limitation: 'Haze and cloud cover reduce optical confidence during the current weather window.',
    },
    {
      id: 'ELINT-PASS',
      name: 'ELINT pass',
      kind: 'elint',
      status: 'simulated',
      coverage: [[56.54, 26.20], [57.54, 26.35], [57.50, 26.86], [56.48, 26.72], [56.54, 26.20]],
      center: [57.08, 26.56],
      revisitMinutes: 44,
      confidence: 64,
      resolution: 'emitter bearing',
      weatherSensitivity: 'low',
      action: 'Listen for navigation radar or comms emissions',
      rationale: 'Can find an AIS-dark vessel if onboard emitters remain active.',
      limitation: 'No detection if the vessel is emission-controlled.',
    },
    {
      id: 'MPA-PATROL',
      name: 'Maritime patrol aircraft',
      kind: 'air',
      status: 'simulated',
      coverage: [[56.62, 26.66], [56.96, 26.82], [57.22, 26.66], [57.04, 26.46], [56.70, 26.46], [56.62, 26.66]],
      center: [56.95, 26.63],
      revisitMinutes: 60,
      confidence: 71,
      resolution: 'visual/radar cue',
      weatherSensitivity: 'medium',
      action: 'Retask patrol orbit if SAR confirms contact',
      rationale: 'Good follow-on custody asset once the first detection narrows the region.',
      limitation: 'Consumes crewed sortie time and does not cover the full uncertainty box at once.',
    },
  ],
  recommendedSensorId: 'SAR-WIDE',
  observation: {
    sensorId: 'SAR-WIDE',
    observedAt: '17:04Z',
    position: [57.06, 26.56],
    confidence: 0.82,
    label: 'Large metallic contact matching tanker motion',
    areaReductionPct: 72,
  },
  weather: {
    source: 'Cached open-weather context',
    status: 'cached',
    observedAt: '16:20Z',
    windKnots: 16,
    visibilityKm: 8.5,
    cloudCoverPct: 38,
    seaState: 'moderate',
    effect: 'SAR and radar remain preferred; optical UAV confidence is degraded by haze and cloud.',
  },
  sources: [
    { name: 'AIS snapshot', detail: 'cached exercise feed for vessel tracks and last-known position', status: 'cached' },
    { name: 'Weather', detail: 'cached open-weather context for wind, visibility, and cloud cover', status: 'cached' },
    { name: 'Sensor actions', detail: 'SAR, radar, UAV, ELINT, and patrol tasking are simulated', status: 'simulated' },
    { name: 'Prediction', detail: 'uncertainty region and area reduction are model outputs', status: 'model' },
  ],
};

export function getRecommendedSandboxSensor(sandbox: HormuzSensorSandbox) {
  return sandbox.sensors.find((sensor) => sensor.id === sandbox.recommendedSensorId) ?? sandbox.sensors[0];
}
