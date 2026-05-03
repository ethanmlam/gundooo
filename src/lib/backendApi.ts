import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

export type ApiVessel = {
  mmsi: number;
  vessel_type?: string;
  vessel_name?: string;
  last_position: {
    lat: number;
    lon: number;
    heading?: number;
    speed_knots?: number;
    timestamp?: string;
  };
  track_points?: Array<{ lat: number; lon: number; timestamp?: string }>;
};

export type DarkEvent = {
  mmsi: number;
  vessel_name?: string;
  vessel_type?: string;
  dark_start?: string;
  dark_end?: string;
  duration_hours?: number;
  last_known_lat: number;
  last_known_lon: number;
  last_known_heading?: number;
  last_known_speed?: number;
};

export type ParticleCloud = {
  mmsi: number;
  n_particles: number;
  dt_hours?: number;
  cloud: {
    lats: number[];
    lons: number[];
    headings?: number[];
    speeds?: number[];
    weights?: number[];
  };
};

export type SearchLoopData = {
  before_polygon: { type: string; geometry: { type: string; coordinates: number[][][] } };
  after_polygon: { type: string; geometry: { type: string; coordinates: number[][][] } };
  area_reduction_pct: number;
  recommended_sensor: { sensor_id: string; [key: string]: unknown };
};

export type BackendState = {
  vessels: ApiVessel[];
  darkEvents: DarkEvent[];
  selectedMmsi: number;
  isBackendOnline: boolean;
  isLoading: boolean;
  statusText: string;
  errors: string[];
  predict: () => void;
  clearPrediction: () => void;
  prediction: ParticleCloud | null;
  predictedMmsi: number | null;
  isPredicting: boolean;
  searchLoopEnabled: boolean;
};

export const DEFAULT_MMSI = 309253000;

export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000';
  return `${window.location.protocol}//${host}:8000`;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

export function useBackendData(selectedMmsi = DEFAULT_MMSI): BackendState {
  const [prediction, setPrediction] = useState<ParticleCloud | null>(null);
  const [predictedMmsi, setPredictedMmsi] = useState<number | null>(null);
  const [searchLoopEnabled, setSearchLoopEnabled] = useState(false);

  useEffect(() => {
    setPrediction(null);
    setPredictedMmsi(null);
    setSearchLoopEnabled(false);
  }, [selectedMmsi]);

  const vesselsQuery = useQuery({
    queryKey: ['backend', 'vessels'],
    queryFn: () => apiFetch<{ vessels: ApiVessel[]; count: number }>('/vessels'),
    refetchInterval: 3500,
    retry: 1,
  });

  const darkEventsQuery = useQuery({
    queryKey: ['backend', 'dark-events'],
    queryFn: () => apiFetch<{ dark_events: DarkEvent[]; count: number }>('/dark-events'),
    refetchInterval: 8000,
    retry: 1,
  });

  const predictMutation = useMutation({
    mutationFn: () => apiFetch<ParticleCloud>('/predict', {
      method: 'POST',
      body: JSON.stringify({ mmsi: selectedMmsi, dt_hours: 2.5, n_particles: 1000 }),
    }),
    onSuccess: (data) => {
      setPrediction(data);
      setPredictedMmsi(selectedMmsi);
      setSearchLoopEnabled(true);
    },
  });

  const vessels = vesselsQuery.data?.vessels ?? [];
  const darkEvents = darkEventsQuery.data?.dark_events ?? [];
  const errors = [vesselsQuery.error, darkEventsQuery.error]
    .filter(Boolean)
    .map((error) => error instanceof Error ? error.message : String(error));
  const isBackendOnline = vesselsQuery.isSuccess || darkEventsQuery.isSuccess;
  const isLoading = vesselsQuery.isLoading || darkEventsQuery.isLoading;

  return {
    vessels,
    darkEvents,
    selectedMmsi,
    isBackendOnline,
    isLoading,
    statusText: isBackendOnline ? 'Backend online' : isLoading ? 'Connecting to backend' : 'Backend offline, using demo scenario',
    errors,
    predict: () => predictMutation.mutate(),
    clearPrediction: () => {
      setPrediction(null);
      setPredictedMmsi(null);
    },
    prediction,
    predictedMmsi,
    isPredicting: predictMutation.isPending,
    searchLoopEnabled,
  };
}

export function useSearchLoop(mmsi: number | null, enabled = false) {
  const query = useQuery({
    queryKey: ['search-loop', mmsi],
    queryFn: () => apiFetch<SearchLoopData>(`/search-loop/${mmsi}`),
    enabled: mmsi != null && enabled,
    refetchInterval: 30000,
    retry: 1,
  });
  return query.data ?? null;
}
