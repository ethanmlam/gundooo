export type QueryIntent =
  | 'dark_gap'
  | 'identity_change'
  | 'air_correlation'
  | 'radar_only'
  | 'loitering'
  | 'rendezvous'
  | 'briefing'
  | 'ghost_track';

export type QueryResult = {
  intent: QueryIntent;
  label: string;
  summary: string;
  evidence: string[];
};

export const cannedQueries = [
  'Show vessels that went dark in the last 6 hours.',
  'Show aircraft near the anomaly zone.',
  'Find vessels that reappeared with a different MMSI.',
  'Show radar-only detections with no AIS correlation.',
  'Which entities are loitering?',
  'Generate a briefing for this theater.',
  'Show possible rendezvous events.',
  'Where could this dark vessel be now?',
];

export function parseQuery(query: string): QueryResult {
  const q = query.toLowerCase();

  if (q.includes('different mmsi') || q.includes('identity') || q.includes('reappeared')) {
    return {
      intent: 'identity_change',
      label: 'Candidate identity switch',
      summary: 'MMSI 412839201 disappears for 71 minutes, then MMSI 413901882 appears 6.8 km from the predicted corridor.',
      evidence: ['AIS gap: 71 min', 'Reappearance offset: 6.8 km', 'Heading delta: 7°', 'Speed match: 13.2 kn → 12.8 kn'],
    };
  }
  if (q.includes('air') || q.includes('aircraft') || q.includes('ads')) {
    return {
      intent: 'air_correlation',
      label: 'Air correlation',
      summary: 'One patrol aircraft orbit overlaps the anomaly window, but no direct intercept path is detected.',
      evidence: ['ADS-B orbit radius tightening', 'Closest approach: 41 km', 'Time overlap: 14:31Z to 14:47Z'],
    };
  }
  if (q.includes('radar-only') || (q.includes('radar') && q.includes('no ais'))) {
    return {
      intent: 'radar_only',
      label: 'Radar-only detections',
      summary: 'Synthetic radar reports two contacts without AIS correlation inside the reef exclusion watch zone.',
      evidence: ['Radar contact R-204 confidence 82%', 'No AIS within 9.4 km', 'Contact inside watch polygon'],
    };
  }
  if (q.includes('loiter')) {
    return {
      intent: 'loitering',
      label: 'Loitering entities',
      summary: 'Three slow-speed tracks remain inside a 14 km box for more than 46 minutes.',
      evidence: ['Mean speed below 2.1 kn', 'Course variance high', 'Repeated passes near zone edge'],
    };
  }
  if (q.includes('rendezvous')) {
    return {
      intent: 'rendezvous',
      label: 'Possible rendezvous',
      summary: 'Two tracks converge within 3.2 km during the AIS silence window, but confidence remains medium.',
      evidence: ['CPA: 3.2 km', 'Overlap: 11 minutes', 'One vessel AIS-dark during overlap'],
    };
  }
  if (q.includes('briefing')) {
    return {
      intent: 'briefing',
      label: 'Theater briefing',
      summary: 'High-priority anomaly: AIS-dark vessel likely changed identity after radar-only segment near the reef watch zone.',
      evidence: ['1 high severity alert', '2 medium severity alerts', 'Recommended action: task SAR and monitor MMSI 413901882'],
    };
  }
  if (q.includes('where') || q.includes('could') || q.includes('ghost')) {
    return {
      intent: 'ghost_track',
      label: 'Ghost track projection',
      summary: 'Projected corridor places the dark vessel east of the last AIS point with a likely radar match inside the cone.',
      evidence: ['Last speed: 13.2 kn', 'Heading: 041°', 'Uncertainty cone: 22 km wide', 'Radar match: 82%'],
    };
  }
  return {
    intent: 'dark_gap',
    label: 'AIS-dark vessels',
    summary: 'One high-priority vessel went dark inside the last 6 hours and has a radar-only continuation.',
    evidence: ['MMSI 412839201 last seen 14:32Z', 'AIS silence: 71 min', 'Radar-only hit: 14:41Z', 'Risk score: 88/100'],
  };
}

export function queryChips(query: string) {
  const result = parseQuery(query);
  return [result.label, result.intent.replace('_', ' ')];
}
