export type MissionScenario = {
  id: string;
  title: string;
  center: [number, number];
  defaultZoom?: number;
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

export const straitOfHormuzScenario: MissionScenario = {
  id: 'strait-of-hormuz',
  title: 'Strait of Hormuz ship risk watch',
  center: [56.35, 26.35],
  vesselTracks: [
    { id: 'VLCC-381', kind: 'tanker', severity: 'HIGH', label: 'VLCC slowing in westbound lane', path: [[55.35, 26.1], [55.72, 26.18], [56.08, 26.24], [56.38, 26.32], [56.7, 26.45]] },
    { id: 'LNG-612', kind: 'tanker', severity: 'HIGH', label: 'LNG carrier holding near lane merge', path: [[55.95, 26.55], [56.16, 26.55], [56.34, 26.52], [56.46, 26.50], [56.53, 26.50]] },
    { id: 'CRUDE-044', kind: 'tanker', severity: 'MED', label: 'Crude tanker slow transit', path: [[55.58, 26.34], [55.9, 26.39], [56.22, 26.45], [56.55, 26.52], [56.88, 26.62]] },
    { id: 'CARGO-2047', kind: 'cargo', severity: 'MED', label: 'Cargo vessel hugging Omani coast', path: [[56.0, 25.9], [56.28, 25.98], [56.56, 26.05], [56.88, 26.14], [57.18, 26.25]] },
    { id: 'BULK-771', kind: 'bulk carrier', severity: 'LOW', label: 'Bulk carrier normal eastbound transit', path: [[55.15, 26.02], [55.55, 26.08], [55.95, 26.15], [56.35, 26.22], [56.74, 26.31]] },
    { id: 'CONT-508', kind: 'container', severity: 'LOW', label: 'Container ship normal traffic lane', path: [[57.25, 26.65], [56.9, 26.58], [56.52, 26.50], [56.12, 26.43], [55.75, 26.36]] },
    { id: 'CHEM-290', kind: 'chemical tanker', severity: 'MED', label: 'Chemical tanker below lane speed', path: [[57.35, 26.18], [57.05, 26.16], [56.72, 26.15], [56.42, 26.16], [56.13, 26.18]] },
    { id: 'TUG-118', kind: 'tug', severity: 'LOW', label: 'Tug and service craft near approaches', path: [[56.42, 26.03], [56.5, 26.08], [56.58, 26.09], [56.62, 26.12], [56.68, 26.14]] },
    { id: 'SUPPLY-73', kind: 'offshore supply', severity: 'LOW', label: 'Offshore supply vessel near Fujairah approaches', path: [[56.95, 25.72], [56.85, 25.82], [56.75, 25.92], [56.65, 26.02], [56.58, 26.11]] },
    { id: 'PATROL-P8', kind: 'aircraft', severity: 'MED', label: 'Maritime patrol orbit east of chokepoint', path: [[56.95, 26.85], [56.62, 26.72], [56.48, 26.95], [56.82, 27.08], [57.08, 26.92]] },
  ],
  ghostTrack: [[56.7, 26.45], [56.86, 26.5], [57.05, 26.56], [57.28, 26.62]],
  radarCone: [[56.0, 26.05], [57.35, 26.82], [57.10, 25.78]],
  zones: [
    { name: 'Traffic separation scheme', polygon: [[55.25, 25.98], [57.35, 26.18], [57.22, 26.72], [55.15, 26.45]] },
    { name: 'Slowdown watch box', polygon: [[56.08, 26.18], [56.72, 26.24], [56.62, 26.58], [55.98, 26.48]] },
  ],
  alerts: [
    { severity: 'HIGH', title: 'VLCC speed drop inside Hormuz chokepoint', source: 'AIS + RadarSim', time: '16:12Z' },
    { severity: 'HIGH', title: 'LNG carrier holding near lane merge', source: 'AIS', time: '16:16Z' },
    { severity: 'MED', title: 'AIS density spike near outbound lane', source: 'AIS', time: '16:18Z' },
    { severity: 'LOW', title: 'Fujairah approaches nominal', source: 'OSINT', time: '16:31Z' },
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
    { name: 'OSINT', value: 36 },
  ],
};

export const longBeachScenario: MissionScenario = {
  id: 'long-beach',
  title: 'Long Beach port vessel watch',
  center: [-118.25, 33.72],
  defaultZoom: 10.5,
  vesselTracks: [
    { id: 'BOX-112', kind: 'container', severity: 'HIGH', label: 'Container ship holding outside anchorage', path: [[-118.55, 33.58], [-118.48, 33.60], [-118.42, 33.61], [-118.38, 33.62], [-118.35, 33.63]] },
    { id: 'TANK-045', kind: 'tanker', severity: 'MED', label: 'Tanker slow approach to San Pedro Bay', path: [[-118.64, 33.50], [-118.55, 33.54], [-118.46, 33.58], [-118.37, 33.62], [-118.30, 33.66]] },
    { id: 'AUTO-703', kind: 'vehicle carrier', severity: 'LOW', label: 'Vehicle carrier normal approach', path: [[-118.16, 33.50], [-118.18, 33.56], [-118.20, 33.61], [-118.22, 33.66], [-118.24, 33.70]] },
    { id: 'BULK-219', kind: 'bulk carrier', severity: 'MED', label: 'Bulk carrier loitering near anchorage edge', path: [[-118.48, 33.72], [-118.45, 33.71], [-118.42, 33.72], [-118.44, 33.74], [-118.47, 33.73]] },
    { id: 'TUG-88', kind: 'tug', severity: 'LOW', label: 'Tug crossing harbor approaches', path: [[-118.29, 33.70], [-118.25, 33.71], [-118.21, 33.72], [-118.18, 33.73], [-118.15, 33.74]] },
    { id: 'FEEDER-55', kind: 'container', severity: 'LOW', label: 'Feeder normal departure', path: [[-118.20, 33.74], [-118.25, 33.70], [-118.30, 33.66], [-118.36, 33.62], [-118.43, 33.58]] },
    { id: 'PILOT-12', kind: 'pilot vessel', severity: 'LOW', label: 'Pilot vessel activity near channel', path: [[-118.18, 33.71], [-118.20, 33.70], [-118.22, 33.69], [-118.24, 33.68], [-118.26, 33.67]] },
    { id: 'CARGO-908', kind: 'cargo', severity: 'MED', label: 'Cargo vessel delayed outside port', path: [[-118.58, 33.68], [-118.52, 33.68], [-118.48, 33.67], [-118.45, 33.67], [-118.43, 33.66]] },
  ],
  ghostTrack: [[-118.35, 33.63], [-118.31, 33.65], [-118.27, 33.67], [-118.23, 33.69]],
  radarCone: [[-118.52, 33.55], [-118.18, 33.76], [-118.08, 33.58]],
  zones: [
    { name: 'San Pedro Bay anchorage watch', polygon: [[-118.62, 33.50], [-118.30, 33.52], [-118.24, 33.73], [-118.58, 33.76]] },
    { name: 'Port approach corridor', polygon: [[-118.35, 33.60], [-118.12, 33.68], [-118.16, 33.78], [-118.42, 33.68]] },
  ],
  alerts: [
    { severity: 'HIGH', title: 'Container ship holding outside anchorage', source: 'AIS', time: '09:12Z' },
    { severity: 'MED', title: 'Bulk carrier loitering near anchorage edge', source: 'AIS', time: '09:18Z' },
    { severity: 'MED', title: 'Tanker slow approach to San Pedro Bay', source: 'AIS', time: '09:24Z' },
    { severity: 'LOW', title: 'Pilot vessel activity nominal', source: 'Port ops', time: '09:31Z' },
  ],
  feedVolume: [
    { t: '09:00', AIS: 92, ADSB: 2, Radar: 0 },
    { t: '09:10', AIS: 98, ADSB: 2, Radar: 1 },
    { t: '09:20', AIS: 101, ADSB: 1, Radar: 2 },
    { t: '09:30', AIS: 95, ADSB: 1, Radar: 2 },
    { t: '09:40', AIS: 88, ADSB: 2, Radar: 1 },
    { t: '09:50', AIS: 91, ADSB: 2, Radar: 1 },
  ],
  confidence: [
    { name: 'AIS', value: 74 },
    { name: 'Port ops', value: 58 },
    { name: 'OSINT', value: 31 },
  ],
};

export const scenariosByTheater: Record<string, MissionScenario> = {
  'strait-of-hormuz': straitOfHormuzScenario,
  'persian-gulf': straitOfHormuzScenario,
  'long-beach': longBeachScenario,
};

export const missionScenario = straitOfHormuzScenario;
