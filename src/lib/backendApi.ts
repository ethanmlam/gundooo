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

export type TriageEntry = {
  mmsi: number;
  vessel_name: string;
  vessel_type: string;
  threat_score: number;
  intent: string;
  intent_confidence?: number;
  dark_duration_hours: number;
  reasoning: string;
  fused_threat_belief?: number | null;
  fusion_recommendation?: string | null;
  source_breakdown?: unknown;
};

export type Allocation = {
  priority: number;
  mmsi: number;
  vessel_name: string;
  threat_score: number;
  assigned_sensor: string;
  expected_entropy_reduction: number;
  expected_area_reduction_pct: number;
  weather_impact: string;
  rationale: string;
};

export type AllocationResult = {
  allocations: Allocation[];
  unassigned_vessels: Array<{ mmsi: number; vessel_name?: string; threat_score?: number; note?: string }>;
  sensors_remaining: Array<{ sensor_id: string; passes_remaining: number }>;
  total_expected_information_gain: number;
  optimization_method: string;
};

export type FusionSource = {
  type: string;
  status: string;
  confidence: number;
  detail: string;
  timestamp: string;
};

export type FusionResult = {
  mmsi: number;
  vessel_name: string;
  sources: FusionSource[];
  fused_threat_belief: number;
  fused_safe_belief: number;
  fused_uncertainty: number;
  fusion_method: string;
  recommendation: string;
  next_overpass_utc?: string | null;
  weather_impact?: string | null;
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

  const triageQuery = useQuery({
    queryKey: ['backend', 'triage'],
    queryFn: () => apiFetch<{ triage: TriageEntry[]; count: number }>('/triage'),
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
  const triage = triageQuery.data?.triage ?? [];
  const errors = [vesselsQuery.error, darkEventsQuery.error, triageQuery.error]
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

export function useAllocation() {
  const query = useQuery({
    queryKey: ['allocator', 'default'],
    queryFn: () => apiFetch<AllocationResult>('/allocate/default'),
    refetchInterval: 15000,
    retry: 1,
  });
  return query.data ?? null;
}

export function useFusion(mmsi: number | null, enabled = true) {
  const query = useQuery({
    queryKey: ['fusion', mmsi],
    queryFn: () => apiFetch<FusionResult>(`/fusion/${mmsi}`),
    enabled: mmsi != null && enabled,
    refetchInterval: 30000,
    retry: 1,
  });
  return query.data ?? null;
}
