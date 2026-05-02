import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import { missionScenario, type MissionScenario } from '../../data/scenario';
import { useLiveAis } from '../../lib/useLiveAis';
import type { BackendState, ApiVessel, DarkEvent, ParticleCloud, Recommendation, SensorTasking } from '../../lib/backendApi';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

type Props = {
  scenario?: MissionScenario;
  backend?: BackendState;
  onSelectMmsi?: (mmsi: number) => void;
};

function vesselPosition(vessel: ApiVessel) {
  return [vessel.last_position.lon, vessel.last_position.lat];
}

function vesselTrack(vessel: ApiVessel) {
  return (vessel.track_points ?? []).map((point) => [point.lon, point.lat]);
}

function particleData(prediction: ParticleCloud | null) {
  if (!prediction) return [];
  const weights = prediction.cloud.weights ?? [];
  const maxWeight = Math.max(...weights, 0.001);
  return prediction.cloud.lats.map((lat, index) => ({
    position: [prediction.cloud.lons[index], lat],
    weight: (weights[index] ?? 1 / prediction.cloud.lats.length) / maxWeight,
  }));
}

function regionPolygon(recommendation: Recommendation | null) {
  const geometry = recommendation?.prediction_region?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [{ polygon: geometry.coordinates[0] }];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((poly: number[][][]) => ({ polygon: poly[0] }));
  return [];
}

function darkEventPosition(event: DarkEvent) {
  return [event.last_known_lon, event.last_known_lat];
}

function taskingPosition(tasking: SensorTasking) {
  return [tasking.center_lon, tasking.center_lat];
}

export function TacticalMap({ scenario = missionScenario, backend, onSelectMmsi }: Props) {
  const showLiveAis = !backend?.isBackendOnline && (scenario.id === 'strait-of-hormuz' || scenario.id === 'persian-gulf');
  const { snapshot, isFresh } = useLiveAis(showLiveAis);
  const liveVessels = isFresh ? snapshot.vessels : [];
  const backendVessels = backend?.vessels ?? [];
  const darkEvents = backend?.darkEvents ?? [];
  const particles = particleData(backend?.prediction ?? null);
  const taskings = backend?.recommendation?.taskings ?? [];
  const predictionRegions = regionPolygon(backend?.recommendation ?? null);

  const layers = [
    new PolygonLayer({
      id: 'zone',
      data: scenario.zones,
      getPolygon: (d: any) => d.polygon,
      getFillColor: [37, 99, 235, 20],
      getLineColor: [56, 189, 248, 115],
      getLineWidth: 1,
      lineWidthMinPixels: 1,
    }),
    new PolygonLayer({
      id: 'prediction-region',
      data: predictionRegions,
      getPolygon: (d: any) => d.polygon,
      getFillColor: [56, 189, 248, 28],
      getLineColor: [125, 211, 252, 210],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
    }),
    new PolygonLayer({
      id: 'radar-cone',
      data: [{ polygon: scenario.radarCone }],
      getPolygon: (d: any) => d.polygon,
      getFillColor: [212, 165, 82, 34],
      getLineColor: [212, 165, 82, 160],
      getLineWidth: 1,
      lineWidthMinPixels: 1,
    }),
    new PathLayer({
      id: 'scenario-tracks',
      data: backend?.isBackendOnline ? [] : scenario.vesselTracks,
      getPath: (d: any) => d.path,
      getColor: (d: any) => d.severity === 'HIGH' ? [245, 158, 11, 230] : d.severity === 'MED' ? [212, 165, 82, 210] : [88, 126, 170, 160],
      getWidth: (d: any) => d.severity === 'HIGH' ? 3 : 2,
      widthMinPixels: 1,
      rounded: true,
    }),
    new PathLayer({
      id: 'backend-vessel-tracks',
      data: backendVessels.filter((v) => (v.track_points?.length ?? 0) > 1),
      getPath: vesselTrack,
      getColor: [96, 165, 250, 135],
      getWidth: 1.5,
      widthMinPixels: 1,
      rounded: true,
    }),
    new PathLayer({
      id: 'ghost-track',
      data: backend?.isBackendOnline ? [] : [{ path: scenario.ghostTrack }],
      getPath: (d: any) => d.path,
      getColor: [120, 220, 165, 210],
      getWidth: 2,
      widthMinPixels: 1,
      rounded: true,
    }),
    new ScatterplotLayer({
      id: 'prediction-particles',
      data: particles,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => 350 + d.weight * 1650,
      radiusMinPixels: 2,
      radiusMaxPixels: 9,
      getFillColor: (d: any) => [56, 189, 248, Math.max(24, Math.round(210 * d.weight))],
      getLineColor: [226, 232, 240, 60],
      stroked: false,
    }),
    new ScatterplotLayer({
      id: 'backend-vessels',
      data: backendVessels,
      getPosition: vesselPosition,
      getRadius: (d: ApiVessel) => d.last_position.speed_knots != null && d.last_position.speed_knots < 1 ? 1200 : 850,
      radiusMinPixels: 4,
      radiusMaxPixels: 11,
      getFillColor: (d: ApiVessel) => d.mmsi === backend?.selectedMmsi ? [245, 158, 11, 235] : d.last_position.speed_knots != null && d.last_position.speed_knots < 1 ? [251, 191, 36, 210] : [125, 211, 252, 200],
      getLineColor: [255, 255, 255, 215],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      onClick: ({ object }: any) => object?.mmsi && onSelectMmsi?.(object.mmsi),
    }),
    new ScatterplotLayer({
      id: 'dark-event-heads',
      data: darkEvents,
      getPosition: darkEventPosition,
      getRadius: 1800,
      radiusMinPixels: 8,
      radiusMaxPixels: 16,
      getFillColor: [245, 158, 11, 230],
      getLineColor: [255, 255, 255, 230],
      lineWidthMinPixels: 2,
      stroked: true,
      pickable: true,
      onClick: ({ object }: any) => object?.mmsi && onSelectMmsi?.(object.mmsi),
    }),
    new ScatterplotLayer({
      id: 'sensor-taskings',
      data: taskings,
      getPosition: taskingPosition,
      getRadius: (d: SensorTasking) => 900 + d.expected_entropy_reduction * 900,
      radiusMinPixels: 7,
      radiusMaxPixels: 18,
      getFillColor: [52, 211, 153, 210],
      getLineColor: [236, 253, 245, 230],
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    new ScatterplotLayer({
      id: 'scenario-track-heads',
      data: backend?.isBackendOnline ? [] : scenario.vesselTracks.map((track) => ({ ...track, position: track.path[track.path.length - 1] })),
      getPosition: (d: any) => d.position,
      getRadius: 2500,
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      getFillColor: (d: any) => d.severity === 'HIGH' ? [245, 158, 11, 190] : [120, 150, 185, 150],
      getLineColor: [255, 255, 255, 220],
      lineWidthMinPixels: 1,
      stroked: true,
    }),
    new PathLayer({
      id: 'live-ais-trails',
      data: liveVessels.filter((v) => v.track?.length > 1),
      getPath: (d: any) => d.track,
      getColor: [83, 178, 255, 145],
      getWidth: 1.5,
      widthMinPixels: 1,
      rounded: true,
    }),
    new ScatterplotLayer({
      id: 'live-ais-vessels',
      data: liveVessels,
      getPosition: (d: any) => [d.lng, d.lat],
      getRadius: (d: any) => d.sog != null && d.sog < 1 ? 1150 : 800,
      radiusMinPixels: 3,
      radiusMaxPixels: 9,
      getFillColor: (d: any) => d.sog != null && d.sog < 1 ? [251, 191, 36, 220] : [125, 211, 252, 200],
      getLineColor: [255, 255, 255, 210],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      onClick: ({ object }: any) => object?.mmsi && onSelectMmsi?.(Number(object.mmsi)),
    }),
    new TextLayer({
      id: 'backend-labels',
      data: [
        ...backendVessels.filter((v) => v.mmsi === backend?.selectedMmsi).map((v) => ({ text: `${v.vessel_name || v.mmsi}`, position: vesselPosition(v) })),
        ...darkEvents.slice(0, 5).map((e) => ({ text: e.vessel_name || `${e.mmsi}`, position: darkEventPosition(e) })),
        ...taskings.slice(0, 4).map((t) => ({ text: t.sensor_id, position: taskingPosition(t) })),
      ],
      getPosition: (d: any) => d.position,
      getText: (d: any) => d.text,
      getSize: 11,
      getColor: [226, 232, 240, 240],
      getPixelOffset: [0, -18],
      background: true,
      getBackgroundColor: [3, 7, 18, 225],
      backgroundPadding: [4, 2],
    }),
    new TextLayer({
      id: 'live-ais-labels',
      data: liveVessels
        .filter((v) => v.sog != null && v.sog < 2)
        .slice(0, 12)
        .map((v) => ({ text: `${v.label} ${v.sog?.toFixed?.(1) ?? ''}kn`, position: [v.lng, v.lat] })),
      getPosition: (d: any) => d.position,
      getText: (d: any) => d.text,
      getSize: 10,
      getColor: [226, 232, 240, 230],
      getPixelOffset: [0, 13],
      background: true,
      getBackgroundColor: [3, 7, 18, 220],
      backgroundPadding: [4, 2],
    }),
    new TextLayer({
      id: 'scenario-labels',
      data: backend?.isBackendOnline ? [] : scenario.vesselTracks.map((track) => ({ text: track.id, position: track.path[track.path.length - 1] })),
      getPosition: (d: any) => d.position,
      getText: (d: any) => d.text,
      getSize: 12,
      getColor: [232, 236, 242, 235],
      getPixelOffset: [0, -18],
      background: true,
      getBackgroundColor: [5, 6, 10, 220],
      backgroundPadding: [5, 3],
    }),
  ];

  return <DeckGL
    initialViewState={{ longitude: scenario.center[0], latitude: scenario.center[1], zoom: 7.2, pitch: 34, bearing: -18 }}
    controller={true}
    layers={layers}
  >
    <Map mapStyle={MAP_STYLE} />
  </DeckGL>;
}
