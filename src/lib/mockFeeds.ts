export async function fetchFeedStatus() {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return [
    { feed: 'AIS', status: 'degraded', latency: '4.8s' },
    { feed: 'ADS-B', status: 'online', latency: '1.1s' },
    { feed: 'RadarSim', status: 'online', latency: '0.6s' },
    { feed: 'OSINT', status: 'online', latency: '8.2s' },
  ];
}
