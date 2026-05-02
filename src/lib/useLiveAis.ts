import { useEffect, useState } from 'react';

export type LiveAisVessel = {
  mmsi: string;
  name?: string;
  lat: number;
  lng: number;
  sog?: number;
  cog?: number;
  heading?: number;
  navStatus?: number;
  lastSeen: string;
  track: number[][];
  label: string;
};

export type LiveAisSnapshot = {
  status: 'waiting' | 'connecting' | 'polling' | 'live' | 'reconnecting' | 'stopped' | 'error';
  source?: string;
  area?: string;
  updatedAt: string | null;
  messageCount: number;
  vesselCount: number;
  lastError?: string | null;
  bbox: number[][];
  vessels: LiveAisVessel[];
};

const emptySnapshot: LiveAisSnapshot = {
  status: 'waiting',
  updatedAt: null,
  messageCount: 0,
  vesselCount: 0,
  bbox: [[25.4, 55.0], [27.3, 57.7]],
  vessels: [],
};

function liveAisUrl() {
  const path = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
  return `${window.location.origin}${path}data/live_ais_hormuz.json`;
}

export function useLiveAis(enabled = true) {
  const [snapshot, setSnapshot] = useState<LiveAisSnapshot>(emptySnapshot);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${liveAisUrl()}?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setSnapshot({ ...emptySnapshot, ...data, vessels: data.vessels ?? [] });
      } catch {
        if (!cancelled) setSnapshot((current) => ({ ...current, status: current.status === 'live' ? 'reconnecting' : current.status }));
      }
    }

    load();
    const timer = window.setInterval(load, 2200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  const updatedAtMs = snapshot.updatedAt ? Date.parse(snapshot.updatedAt) : 0;
  const isFresh = Boolean(updatedAtMs && Date.now() - updatedAtMs < 45_000);

  return { snapshot, isFresh };
}
