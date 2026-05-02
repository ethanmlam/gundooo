export type Theater = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  risk: 'High' | 'Medium' | 'Low';
  feeds: string[];
  summary: string;
};

export const theaters: Theater[] = [
  {
    id: 'south-china-sea',
    name: 'South China Sea',
    lat: 13.5,
    lng: 114.0,
    risk: 'High',
    feeds: ['AIS', 'ADS-B', 'RadarSim', 'Weather'],
    summary: 'Dense maritime traffic, contested reefs, and frequent gray-zone activity.',
  },
  {
    id: 'taiwan-strait',
    name: 'Taiwan Strait',
    lat: 24.2,
    lng: 120.8,
    risk: 'High',
    feeds: ['AIS', 'ADS-B', 'RF'],
    summary: 'High-tempo air and maritime activity near critical shipping lanes.',
  },
  {
    id: 'strait-of-hormuz',
    name: 'Strait of Hormuz',
    lat: 26.6,
    lng: 56.3,
    risk: 'High',
    feeds: ['AIS', 'ADS-B', 'RadarSim', 'Incident OSINT'],
    summary: 'Critical oil chokepoint with dense tanker lanes, patrol activity, and escalation risk.',
  },
  {
    id: 'persian-gulf',
    name: 'Persian Gulf',
    lat: 26.5,
    lng: 52.0,
    risk: 'Medium',
    feeds: ['AIS', 'ADS-B', 'RadarSim'],
    summary: 'Energy infrastructure, narrow chokepoints, and tanker route anomalies.',
  },
  {
    id: 'red-sea',
    name: 'Red Sea',
    lat: 17.5,
    lng: 39.5,
    risk: 'High',
    feeds: ['AIS', 'ADS-B', 'RadarSim', 'Incident OSINT'],
    summary: 'Commercial shipping risk corridor with emerging missile and drone threats.',
  },
  {
    id: 'baltic-sea',
    name: 'Baltic Sea',
    lat: 58.0,
    lng: 20.0,
    risk: 'Medium',
    feeds: ['AIS', 'Cable Intel', 'RF'],
    summary: 'Subsea cable and pipeline watch with dense coastal vessel traffic.',
  },
];
