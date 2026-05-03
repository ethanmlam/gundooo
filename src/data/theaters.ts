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
    id: 'strait-of-hormuz',
    name: 'Strait of Hormuz',
    lat: 26.6,
    lng: 56.3,
    risk: 'High',
    feeds: ['AIS exercise', 'Weather', 'SensorSim'],
    summary: 'Oil chokepoint exercise: missing tanker custody, weather-aware sensor tasking, and search-area reduction.',
  },
  {
    id: 'long-beach',
    name: 'Long Beach',
    lat: 33.72,
    lng: -118.25,
    risk: 'Medium',
    feeds: ['AIS', 'Port ops', 'OSINT'],
    summary: 'Port and anchorage watch: congestion, loitering, arrivals, and cargo vessel profiling.',
  },
];
