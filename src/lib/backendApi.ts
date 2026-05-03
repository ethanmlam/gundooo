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
  recommended_sensor: SensorTasking & { [key: string]: unknown };
};

export type SensorTasking = {
  sensor_id: string;
  expected_entropy_reduction: number;
  center_lat: number;
  center_lon: number;
  revisit_hrs?: number;
  res_m?: number | null;
};

export type SensorRecommendation = {
  mmsi: number;
  taskings: SensorTasking[];
  prediction_region?: unknown;
};

export type TriageEntry = {
  mmsi: number;
  vessel_name: string;
  vessel_type: string;
  threat_score: number;
  intent: string;
  intent_confidence?: number;
  dark_duration_hours: number;
  reasoning: string;
};

export type BackendState = {
  vessels: ApiVessel[];
  darkEvents: DarkEvent[];
  triage: TriageEntry[];
  selectedMmsi: number;
  isBackendOnline: boolean;
  isLoading: boolean;
  statusText: string;
  errors: string[];
  predict: () => void;
  updateWithSyntheticDetection: () => void;
  clearPrediction: () => void;
  prediction: ParticleCloud | null;
  predictedMmsi: number | null;
  recommendation: SensorRecommendation | null;
  isPredicting: boolean;
  isUpdating: boolean;
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

function normalizeCloud(data: any, mmsi: number, dtHours?: number): ParticleCloud {
  const cloud = data.cloud ?? data;
  return {
    mmsi,
    dt_hours: data.dt_hours ?? dtHours,
    n_particles: data.n_particles ?? cloud.lats?.length ?? 0,
    cloud,
  };
}

function cloudCenter(prediction: ParticleCloud | null) {
  const lats = prediction?.cloud.lats ?? [];
  const lons = prediction?.cloud.lons ?? [];
  if (!lats.length || !lons.length) return null;
  const weights = prediction?.cloud.weights ?? [];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight > 0 && weights.length === lats.length) {
    return {
      lat: lats.reduce((sum, lat, index) => sum + lat * weights[index], 0) / totalWeight,
      lon: lons.reduce((sum, lon, index) => sum + lon * weights[index], 0) / totalWeight,
    };
  }
  return {
    lat: lats.reduce((sum, lat) => sum + lat, 0) / lats.length,
    lon: lons.reduce((sum, lon) => sum + lon, 0) / lons.length,
  };
}

export function useBackendData(selectedMmsi = DEFAULT_MMSI): BackendState {
  const [prediction, setPrediction] = useState<ParticleCloud | null>(null);
  const [predictedMmsi, setPredictedMmsi] = useState<number | null>(null);
  const [searchLoopEnabled, setSearchLoopEnabled] = useState(false);
  const [predictionVersion, setPredictionVersion] = useState(0);

  useEffect(() => {
    setPrediction(null);
    setPredictedMmsi(null);
    setSearchLoopEnabled(false);
    setPredictionVersion((value) => value + 1);
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

  const triageQuery = useQuery({
    queryKey: ['backend', 'triage'],
    queryFn: () => apiFetch<{ triage: TriageEntry[]; count: number }>('/triage'),
    refetchInterval: 8000,
    retry: 1,
  });

  const recommendationQuery = useQuery({
    queryKey: ['backend', 'recommend', selectedMmsi, predictionVersion],
    queryFn: () => apiFetch<SensorRecommendation>(`/recommend/${selectedMmsi}`),
    enabled: Boolean(prediction && predictedMmsi === selectedMmsi),
    retry: 1,
  });

  const predictMutation = useMutation({
    mutationFn: () => apiFetch<ParticleCloud>('/predict', {
      method: 'POST',
      body: JSON.stringify({ mmsi: selectedMmsi, dt_hours: 2.5, n_particles: 1000 }),
    }),
    onSuccess: (data) => {
      setPrediction(normalizeCloud(data, selectedMmsi, 2.5));
      setPredictedMmsi(selectedMmsi);
      setSearchLoopEnabled(true);
      setPredictionVersion((value) => value + 1);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const topTasking = recommendationQuery.data?.taskings?.[0];
      const center = topTasking ? { lat: topTasking.center_lat, lon: topTasking.center_lon } : cloudCenter(prediction);
      if (!center) throw new Error('Run prediction before injecting a detection');
      return apiFetch<any>('/update', {
        method: 'POST',
        body: JSON.stringify({
          mmsi: selectedMmsi,
          observation_lat: center.lat,
          observation_lon: center.lon,
          sensor_type: topTasking?.sensor_id ?? 'SAR-synthetic',
          confidence: 0.88,
        }),
      });
    },
    onSuccess: (data) => {
      setPrediction(normalizeCloud(data, selectedMmsi));
      setPredictedMmsi(selectedMmsi);
      setSearchLoopEnabled(true);
      setPredictionVersion((value) => value + 1);
    },
  });

  const vessels = vesselsQuery.data?.vessels ?? [];
  const darkEvents = darkEventsQuery.data?.dark_events ?? [];
  const triage = triageQuery.data?.triage ?? [];
  const errors = [vesselsQuery.error, darkEventsQuery.error, triageQuery.error, recommendationQuery.error, predictMutation.error, updateMutation.error]
    .filter(Boolean)
    .map((error) => error instanceof Error ? error.message : String(error));
  const isBackendOnline = vesselsQuery.isSuccess || darkEventsQuery.isSuccess || triageQuery.isSuccess;
  const isLoading = vesselsQuery.isLoading || darkEventsQuery.isLoading || triageQuery.isLoading;

  return {
    vessels,
    darkEvents,
    triage,
    selectedMmsi,
    isBackendOnline,
    isLoading,
    statusText: isBackendOnline ? 'Backend online' : isLoading ? 'Connecting to backend' : 'Backend offline, using demo scenario',
    errors,
    predict: () => predictMutation.mutate(),
    updateWithSyntheticDetection: () => updateMutation.mutate(),
    clearPrediction: () => {
      setPrediction(null);
      setPredictedMmsi(null);
      setSearchLoopEnabled(false);
      setPredictionVersion((value) => value + 1);
    },
    prediction,
    predictedMmsi,
    recommendation: recommendationQuery.data ?? null,
    isPredicting: predictMutation.isPending,
    isUpdating: updateMutation.isPending,
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
