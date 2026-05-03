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
    id: 'long-beach',
    name: 'Long Beach',
    lat: 33.72,
    lng: -118.25,
    risk: 'Medium',
    feeds: ['AIS', 'Port ops', 'OSINT'],
    summary: 'Port and anchorage watch: congestion, loitering, arrivals, and cargo vessel profiling.',
  },
];
