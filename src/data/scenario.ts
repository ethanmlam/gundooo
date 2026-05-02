export type MissionScenario = {
  id: string;
  title: string;
  center: [number, number];
  vesselTracks: Array<{
    id: string;
    kind: string;
    severity: 'HIGH' | 'MED' | 'LOW';
    label: string;
    path: number[][];
  }>;
  ghostTrack: number[][];
  radarCone: number[][];
  zones: Array<{ name: string; polygon: number[][] }>;
  alerts: Array<{ severity: 'HIGH' | 'MED' | 'LOW'; title: string; source: string; time: string }>;
  feedVolume: Array<{ t: string; AIS: number; ADSB: number; Radar: number }>;
  confidence: Array<{ name: string; value: number }>;
};

export const southChinaSeaScenario: MissionScenario = {
  id: 'south-china-sea',
  title: 'South China Sea live watch',
  center: [114.0, 13.5],
  vesselTracks: [
    {
      id: 'AIS-7421',
      kind: 'cargo',
      severity: 'HIGH',
      label: 'AIS-dark cargo-class vessel',
      path: [[113.45, 13.1], [113.7, 13.22], [113.95, 13.33], [114.15, 13.42], [114.31, 13.51]],
    },
    {
      id: 'AIS-1902',
      kind: 'tanker',
      severity: 'LOW',
      label: 'Tanker, route normal',
      path: [[113.1, 12.7], [113.45, 12.82], [113.8, 12.94], [114.2, 13.02], [114.56, 13.16]],
    },
    {
      id: 'ADS-B-88',
      kind: 'aircraft',
      severity: 'MED',
      label: 'Patrol aircraft orbit',
      path: [[114.6, 14.1], [114.3, 13.95], [114.1, 14.15], [114.42, 14.31], [114.72, 14.18]],
    },
  ],
  ghostTrack: [[114.31, 13.51], [114.46, 13.61], [114.62, 13.7], [114.82, 13.77]],
  radarCone: [[114.16, 13.38], [115.02, 14.02], [114.62, 13.18]],
  zones: [
    { name: 'Reef exclusion watch', polygon: [[114.2, 13.2], [115.02, 13.48], [114.9, 14.1], [114.1, 13.86]] },
  ],
  alerts: [
    { severity: 'HIGH', title: 'AIS dropout near reef watch zone', source: 'AIS + RadarSim', time: '14:32Z' },
    { severity: 'MED', title: 'Patrol aircraft orbit tightening', source: 'ADS-B', time: '14:37Z' },
    { severity: 'MED', title: 'Synthetic radar contact enters ghost corridor', source: 'RadarSim', time: '14:41Z' },
    { severity: 'LOW', title: 'Tanker route normal, no tasking', source: 'AIS', time: '14:44Z' },
  ],
  feedVolume: [
    { t: '14:00', AIS: 42, ADSB: 8, Radar: 0 },
    { t: '14:10', AIS: 46, ADSB: 10, Radar: 1 },
    { t: '14:20', AIS: 40, ADSB: 12, Radar: 2 },
    { t: '14:30', AIS: 27, ADSB: 13, Radar: 4 },
    { t: '14:40', AIS: 24, ADSB: 14, Radar: 8 },
    { t: '14:50', AIS: 31, ADSB: 12, Radar: 9 },
  ],
  confidence: [
    { name: 'AIS', value: 8 },
    { name: 'RadarSim', value: 82 },
    { name: 'ADS-B', value: 54 },
    { name: 'OSINT', value: 41 },
  ],
};

export const straitOfHormuzScenario: MissionScenario = {
  id: 'strait-of-hormuz',
  title: 'Strait of Hormuz tanker watch',
  center: [56.45, 26.45],
  vesselTracks: [
    {
      id: 'TANKER-381',
      kind: 'tanker',
      severity: 'HIGH',
      label: 'VLCC slows near traffic separation lane',
      path: [[55.35, 26.1], [55.72, 26.18], [56.08, 26.24], [56.38, 26.32], [56.7, 26.45]],
    },
    {
      id: 'AIS-2047',
      kind: 'cargo',
      severity: 'MED',
      label: 'Cargo vessel hugging Omani coast',
      path: [[56.0, 25.9], [56.28, 25.98], [56.56, 26.05], [56.88, 26.14], [57.18, 26.25]],
    },
    {
      id: 'ADS-B-P8',
      kind: 'aircraft',
      severity: 'MED',
      label: 'Maritime patrol orbit east of chokepoint',
      path: [[56.95, 26.85], [56.62, 26.72], [56.48, 26.95], [56.82, 27.08], [57.08, 26.92]],
    },
  ],
  ghostTrack: [[56.7, 26.45], [56.86, 26.5], [57.05, 26.56], [57.28, 26.62]],
  radarCone: [[56.25, 26.2], [57.25, 26.75], [56.95, 25.95]],
  zones: [
    { name: 'Hormuz traffic separation watch', polygon: [[55.8, 26.0], [57.25, 26.28], [57.05, 26.78], [55.65, 26.48]] },
  ],
  alerts: [
    { severity: 'HIGH', title: 'Tanker speed drop inside Hormuz chokepoint', source: 'AIS + RadarSim', time: '16:12Z' },
    { severity: 'MED', title: 'AIS density spike near outbound lane', source: 'AIS', time: '16:18Z' },
    { severity: 'MED', title: 'Patrol aircraft orbit overlaps predicted corridor', source: 'ADS-B', time: '16:24Z' },
    { severity: 'LOW', title: 'Port approaches nominal at Fujairah', source: 'OSINT', time: '16:31Z' },
  ],
  feedVolume: [
    { t: '16:00', AIS: 68, ADSB: 5, Radar: 1 },
    { t: '16:10', AIS: 74, ADSB: 6, Radar: 2 },
    { t: '16:20', AIS: 79, ADSB: 9, Radar: 5 },
    { t: '16:30', AIS: 61, ADSB: 8, Radar: 7 },
    { t: '16:40', AIS: 58, ADSB: 7, Radar: 8 },
    { t: '16:50', AIS: 66, ADSB: 5, Radar: 6 },
  ],
  confidence: [
    { name: 'AIS', value: 62 },
    { name: 'RadarSim', value: 76 },
    { name: 'ADS-B', value: 49 },
    { name: 'OSINT', value: 36 },
  ],
};

export const scenariosByTheater: Record<string, MissionScenario> = {
  'south-china-sea': southChinaSeaScenario,
  'strait-of-hormuz': straitOfHormuzScenario,
  'persian-gulf': straitOfHormuzScenario,
};

export const missionScenario = southChinaSeaScenario;
