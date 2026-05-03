import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export type SensorTasking = {
  sensor_id: string;
  expected_entropy_reduction: number;
  center_lat: number;
  center_lon: number;
};

export type Recommendation = {
  mmsi: number;
  taskings: SensorTasking[];
  prediction_region?: any;
};

export type BackendState = {
  vessels: ApiVessel[];
  darkEvents: DarkEvent[];
  recommendation: Recommendation | null;
  selectedMmsi: number;
  isBackendOnline: boolean;
  statusText: string;
  errors: string[];
  predict: () => void;
  updateWithSar: () => void;
  prediction: ParticleCloud | null;
  isPredicting: boolean;
  isUpdating: boolean;
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
  const queryClient = useQueryClient();
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

  const recommendationQuery = useQuery({
    queryKey: ['backend', 'recommend', selectedMmsi],
    queryFn: () => apiFetch<Recommendation>(`/recommend/${selectedMmsi}`),
    enabled: Boolean(selectedMmsi),
    refetchInterval: 12000,
    retry: 1,
  });

  const predictMutation = useMutation({
    mutationFn: () => apiFetch<ParticleCloud>('/predict', {
      method: 'POST',
      body: JSON.stringify({ mmsi: selectedMmsi, dt_hours: 2.5, n_particles: 1000 }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backend', 'recommend', selectedMmsi] }),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const topTasking = recommendationQuery.data?.taskings?.[0];
      const fallbackEvent = darkEventsQuery.data?.dark_events?.find((event) => event.mmsi === selectedMmsi);
      return apiFetch<ParticleCloud>('/update', {
        method: 'POST',
        body: JSON.stringify({
          mmsi: selectedMmsi,
          observation_lat: topTasking?.center_lat ?? (fallbackEvent ? fallbackEvent.last_known_lat - 0.35 : 33.2),
          observation_lon: topTasking?.center_lon ?? (fallbackEvent ? fallbackEvent.last_known_lon - 0.45 : -119.0),
          sensor_type: topTasking?.sensor_id ?? 'SAR',
          confidence: 0.92,
        }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backend', 'recommend', selectedMmsi] }),
  });

  const vessels = vesselsQuery.data?.vessels ?? [];
  const darkEvents = darkEventsQuery.data?.dark_events ?? [];
  const errors = [vesselsQuery.error, darkEventsQuery.error, recommendationQuery.error]
    .filter(Boolean)
    .map((error) => error instanceof Error ? error.message : String(error));
  const isBackendOnline = vesselsQuery.isSuccess || darkEventsQuery.isSuccess || recommendationQuery.isSuccess;
  const isLoading = vesselsQuery.isLoading || darkEventsQuery.isLoading || recommendationQuery.isLoading;
  const prediction = updateMutation.data ?? predictMutation.data ?? null;

  return {
    vessels,
    darkEvents,
    recommendation: recommendationQuery.data ?? null,
    selectedMmsi,
    isBackendOnline,
    statusText: isBackendOnline ? 'Backend online' : isLoading ? 'Connecting to backend' : 'Backend offline, using demo scenario',
    errors,
    predict: () => predictMutation.mutate(),
    updateWithSar: () => updateMutation.mutate(),
    prediction,
    isPredicting: predictMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
