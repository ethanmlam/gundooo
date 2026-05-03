import DeckGL from '@deck.gl/react';
import { useMemo, useState } from 'react';
import { Map } from 'react-map-gl/maplibre';
import { IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import { missionScenario, type MissionScenario } from '../../data/scenario';
import type { HormuzSensorSandbox, SandboxSensor } from '../../data/sensorSandbox';
import { useLiveAis } from '../../lib/useLiveAis';
import type { BackendState, ApiVessel, DarkEvent, ParticleCloud, SearchLoopData } from '../../lib/backendApi';

const BASEMAPS = {
  dark: {
    label: 'Dark',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  },
  terrain: {
    label: 'Terrain',
    style: {
      version: 8,
      sources: {
        topo: {
          type: 'raster',
          tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors, SRTM, OpenTopoMap',
        },
      },
      layers: [{ id: 'topo', type: 'raster', source: 'topo', paint: { 'raster-opacity': 0.92 } }],
    },
  },
  satellite: {
    label: 'Satellite',
    style: {
      version: 8,
      sources: {
        esri: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: 'Tiles © Esri',
        },
      },
      layers: [{ id: 'esri', type: 'raster', source: 'esri', paint: { 'raster-opacity': 0.9 } }],
    },
  },
} as const;

type BasemapKey = keyof typeof BASEMAPS;

type Props = {
  scenario?: MissionScenario;
  backend?: BackendState;
  onSelectMmsi?: (mmsi: number) => void;
  searchLoop?: SearchLoopData | null;
  showAfterPolygon?: boolean;
  sensorSandbox?: HormuzSensorSandbox;
  showSensorResult?: boolean;
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
  return prediction.cloud.lats
    .map((lat, index) => ({
      position: [prediction.cloud.lons[index], lat],
      weight: (weights[index] ?? 1 / prediction.cloud.lats.length) / maxWeight,
    }))
    .filter((p) => !((p.position[1] > 33.78 && p.position[0] > -118.3) || (p.position[1] > 33.85 && p.position[0] > -118.5) || p.position[1] > 34.0));
}

function darkEventPosition(event: DarkEvent) {
  return [event.last_known_lon, event.last_known_lat];
}

const VESSEL_DEFAULT: [number, number, number, number] = [148, 163, 184, 115];
const VESSEL_SELECTED: [number, number, number, number] = [196, 145, 92, 255];
const VESSEL_THREAT: [number, number, number, number] = [229, 72, 77, 89];

function vesselColor(vessel: ApiVessel, selectedMmsi?: number, darkEventMmsis?: Set<number>): [number, number, number, number] {
  if (vessel.mmsi === selectedMmsi) return VESSEL_SELECTED;
  if (darkEventMmsis?.has(vessel.mmsi)) return VESSEL_THREAT;
  return VESSEL_DEFAULT;
}

function vesselAngle(vessel: ApiVessel) {
  const speed = vessel.last_position.speed_knots ?? 0;
  const heading = vessel.last_position.heading;
  if (speed < 0.8 || heading == null || Number.isNaN(Number(heading))) return 0;
  return Number(heading);
}

function vesselIcon(vessel: ApiVessel) {
  const speed = vessel.last_position.speed_knots ?? 0;
  return speed < 0.8 ? 'stopped' : 'arrow';
}

function vesselIconSize(vessel: ApiVessel, selectedMmsi?: number) {
  const speed = vessel.last_position.speed_knots ?? 0;
  if (vessel.mmsi === selectedMmsi) return speed < 0.8 ? 650 : 1100;
  return speed < 0.8 ? 340 : 650;
}

const VESSEL_ICON_ATLAS = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64">
  <g id="arrow" transform="translate(0,0)">
    <path d="M32 5 L57 57 L32 47 L7 57 Z" fill="white"/>
  </g>
  <g id="stopped" transform="translate(64,0)">
    <circle cx="32" cy="32" r="24" fill="white"/>
  </g>
</svg>`);

const VESSEL_ICON_MAPPING = {
  arrow: { x: 0, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32, mask: true },
  stopped: { x: 64, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32, mask: true },
};

function sensorLineColor(sensor: SandboxSensor, recommendedSensorId?: string): [number, number, number, number] {
  if (sensor.id === recommendedSensorId) return [52, 211, 153, 225];
  if (sensor.kind === 'sar') return [56, 189, 248, 175];
  if (sensor.kind === 'radar') return [245, 158, 11, 170];
  if (sensor.kind === 'uav') return [167, 139, 250, 165];
  if (sensor.kind === 'elint') return [250, 204, 21, 160];
  return [148, 163, 184, 150];
}

function sensorFillColor(sensor: SandboxSensor, recommendedSensorId?: string): [number, number, number, number] {
  const alpha = sensor.id === recommendedSensorId ? 32 : 14;
  const [r, g, b] = sensorLineColor(sensor, recommendedSensorId);
  return [r, g, b, alpha];
}

function timeAgo(ts?: string | null) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  return `${Math.floor(sec / 86400)} d ago`;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  color: '#0b1220',
  fontSize: '12px',
  lineHeight: '1.45',
  padding: '8px 12px',
  borderRadius: '4px',
  boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
  border: '1px solid rgba(15,23,42,0.08)',
  fontFamily: 'inherit',
  pointerEvents: 'none' as const,
};

function vesselTooltip(info: any): { html: string; style: typeof TOOLTIP_STYLE } | null {
  const { layer, object } = info ?? {};
  if (!layer || !object) return null;

  if (layer.id === 'backend-vessel-arrows') {
    const name = object.vessel_name || `MMSI ${object.mmsi}`;
    const pos = object.last_position ?? {};
    const speed = pos.speed_knots != null ? `${Number(pos.speed_knots).toFixed(1)} kn` : '—';
    const heading = pos.heading != null ? `${Math.round(Number(pos.heading))}°` : '—';
    const ago = timeAgo(pos.timestamp);
    const type = object.vessel_type ? `<div>Type: <b>${esc(object.vessel_type)}</b></div>` : '';
    const seen = ago ? `<div>Position received: <b>${esc(ago)}</b></div>` : '';
    return { html: `<div><b>${esc(name)}</b> at <b>${esc(speed)} / ${esc(heading)}</b></div>${type}${seen}`, style: TOOLTIP_STYLE };
  }

  if (layer.id === 'selected-dark-event') {
    const name = object.vessel_name || `MMSI ${object.mmsi}`;
    const speed = object.last_known_speed != null ? `${Number(object.last_known_speed).toFixed(1)} kn` : '—';
    const heading = object.last_known_heading != null ? `${Math.round(Number(object.last_known_heading))}°` : '—';
    const wentDark = timeAgo(object.dark_start);
    const dur = object.duration_hours != null ? `<div>Dark for: <b>${Number(object.duration_hours).toFixed(1)} hr</b></div>` : '';
    const seen = wentDark ? `<div>Went dark: <b>${esc(wentDark)}</b></div>` : '';
    return { html: `<div><b>${esc(name)}</b> at <b>${esc(speed)} / ${esc(heading)}</b></div>${dur}${seen}`, style: TOOLTIP_STYLE };
  }

  if (layer.id === 'live-ais-vessels') {
    const name = object.name || object.label || `MMSI ${object.mmsi}`;
    const speed = object.sog != null ? `${Number(object.sog).toFixed(1)} kn` : '—';
    const headingRaw = object.heading ?? object.cog;
    const heading = headingRaw != null ? `${Math.round(Number(headingRaw))}°` : '—';
    const ago = timeAgo(object.lastSeen);
    const seen = ago ? `<div>Position received: <b>${esc(ago)}</b></div>` : '';
    return { html: `<div><b>${esc(name)}</b> at <b>${esc(speed)} / ${esc(heading)}</b></div>${seen}`, style: TOOLTIP_STYLE };
  }

  return null;
}

export function TacticalMap({ scenario = missionScenario, backend, onSelectMmsi, searchLoop, showAfterPolygon, sensorSandbox, showSensorResult }: Props) {
  const [basemap, setBasemap] = useState<BasemapKey>('dark');
  const [showTrails, setShowTrails] = useState(true);
  const initialZoom = scenario.defaultZoom ?? 7.2;
  const mapStyle = useMemo(() => BASEMAPS[basemap].style, [basemap]);
  const showLiveAis = !backend?.isBackendOnline && (scenario.id === 'strait-of-hormuz' || scenario.id === 'persian-gulf');
  const { snapshot, isFresh } = useLiveAis(showLiveAis);
  const liveVessels = isFresh ? snapshot.vessels : [];
  const backendVessels = backend?.vessels ?? [];
  const darkEvents = backend?.darkEvents ?? [];
  const darkEventMmsis = useMemo(() => new Set(darkEvents.map((e) => e.mmsi)), [darkEvents]);
  const particles = particleData(backend?.predictedMmsi === backend?.selectedMmsi ? backend?.prediction ?? null : null);
  const beforePoly = particles.length > 0 ? searchLoop?.before_polygon?.geometry?.coordinates?.[0] ?? null : null;
  const afterPoly = showAfterPolygon ? searchLoop?.after_polygon?.geometry?.coordinates?.[0] ?? null : null;
  const recommendedSensorId = sensorSandbox?.recommendedSensorId;
  const sandboxTarget = sensorSandbox?.target;
  const sandboxObservation = showSensorResult ? sensorSandbox?.observation : null;

  const layers = [
    new PolygonLayer({
      id: 'zone',
      data: backend?.isBackendOnline ? [] : scenario.zones,
      getPolygon: (d: any) => d.polygon,
      getFillColor: [37, 99, 235, 20],
      getLineColor: [56, 189, 248, 115],
      getLineWidth: 1,
      lineWidthMinPixels: 1,
    }),
    new PolygonLayer({
      id: 'radar-cone',
      data: backend?.isBackendOnline ? [] : [{ polygon: scenario.radarCone }],
      getPolygon: (d: any) => d.polygon,
      getFillColor: [196, 145, 92, 34],
      getLineColor: [196, 145, 92, 160],
      getLineWidth: 1,
      lineWidthMinPixels: 1,
    }),
    new PolygonLayer({
      id: 'sandbox-sensor-coverage',
      data: sensorSandbox?.sensors ?? [],
      getPolygon: (d: any) => d.coverage,
      getFillColor: (d: SandboxSensor) => sensorFillColor(d, recommendedSensorId),
      getLineColor: (d: SandboxSensor) => sensorLineColor(d, recommendedSensorId),
      getLineWidth: (d: SandboxSensor) => d.id === recommendedSensorId ? 2 : 1,
      lineWidthMinPixels: 1,
      stroked: true,
    }),
    new PolygonLayer({
      id: 'sandbox-search-before',
      data: sandboxTarget ? [{ polygon: sandboxTarget.predictionBefore }] : [],
      getPolygon: (d: any) => d.polygon,
      getFillColor: [56, 189, 248, 24],
      getLineColor: [56, 189, 248, 205],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    new PolygonLayer({
      id: 'sandbox-search-after',
      data: sandboxObservation && sandboxTarget ? [{ polygon: sandboxTarget.predictionAfter }] : [],
      getPolygon: (d: any) => d.polygon,
      getFillColor: [52, 211, 153, 22],
      getLineColor: [52, 211, 153, 225],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    new PathLayer({
      id: 'scenario-tracks',
      data: backend?.isBackendOnline ? [] : scenario.vesselTracks,
      getPath: (d: any) => d.path,
      getColor: [148, 163, 184, 30],
      getWidth: 1.5,
      widthMinPixels: 1,
      rounded: true,
    }),
    new PathLayer({
      id: 'backend-vessel-tracks',
      data: showTrails ? backendVessels.filter((v) => (v.track_points?.length ?? 0) > 1) : [],
      getPath: vesselTrack,
      getColor: [125, 211, 252, 150],
      getWidth: 1.5,
      widthMinPixels: 1,
      rounded: true,
    }),
    new PathLayer({
      id: 'ghost-track',
      data: backend?.isBackendOnline ? [] : [{ path: scenario.ghostTrack }],
      getPath: (d: any) => d.path,
      getColor: [148, 163, 184, 30],
      getWidth: 1.5,
      widthMinPixels: 1,
      rounded: true,
    }),
    new PathLayer({
      id: 'sandbox-projected-track',
      data: sandboxTarget ? [{ path: sandboxTarget.projectedTrack }] : [],
      getPath: (d: any) => d.path,
      getColor: [52, 211, 153, 230],
      getWidth: 2.5,
      widthMinPixels: 2,
      rounded: true,
    }),
    new PolygonLayer({
      id: 'search-region-before',
      data: beforePoly ? [{ polygon: beforePoly }] : [],
      getPolygon: (d: any) => d.polygon,
      getFillColor: [196, 145, 92, 38],
      getLineColor: [196, 145, 92, 153],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    new PolygonLayer({
      id: 'search-region-after',
      data: afterPoly ? [{ polygon: afterPoly }] : [],
      getPolygon: (d: any) => d.polygon,
      getFillColor: [70, 167, 88, 30],
      getLineColor: [70, 167, 88, 128],
      getLineWidth: 2,
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    new ScatterplotLayer({
      id: 'prediction-particles',
      data: particles,
      getPosition: (d: any) => d.position,
      getRadius: 80,
      radiusMinPixels: 2,
      radiusMaxPixels: 5,
      getFillColor: (d: any) => d.weight > 0.7 ? [229, 72, 77, 200] : d.weight > 0.3 ? [196, 145, 92, 160] : [148, 163, 184, 89],
      stroked: false,
    }),
    new ScatterplotLayer({
      id: 'sandbox-last-ais',
      data: sandboxTarget ? [{ position: sandboxTarget.lastAisPosition }] : [],
      getPosition: (d: any) => d.position,
      getRadius: 1150,
      radiusMinPixels: 10,
      radiusMaxPixels: 26,
      getFillColor: [245, 158, 11, 90],
      getLineColor: [245, 158, 11, 255],
      lineWidthMinPixels: 2,
      stroked: true,
      billboard: true,
    }),
    new ScatterplotLayer({
      id: 'sandbox-sensor-hit',
      data: sandboxObservation ? [{ position: sandboxObservation.position }] : [],
      getPosition: (d: any) => d.position,
      getRadius: 850,
      radiusMinPixels: 8,
      radiusMaxPixels: 22,
      getFillColor: [52, 211, 153, 140],
      getLineColor: [226, 232, 240, 240],
      lineWidthMinPixels: 2,
      stroked: true,
      billboard: true,
    }),
    new ScatterplotLayer({
      id: 'selected-vessel-halo',
      data: backendVessels.filter((v) => v.mmsi === backend?.selectedMmsi),
      getPosition: vesselPosition,
      getRadius: 900,
      radiusMinPixels: 10,
      radiusMaxPixels: 34,
      getFillColor: [15, 23, 42, 70],
      getLineColor: [0, 0, 0, 240],
      lineWidthMinPixels: 2,
      stroked: true,
      billboard: true,
    }),
    new IconLayer({
      id: 'backend-vessel-arrows',
      data: backendVessels,
      iconAtlas: VESSEL_ICON_ATLAS,
      iconMapping: VESSEL_ICON_MAPPING,
      getIcon: vesselIcon,
      getPosition: vesselPosition,
      getAngle: vesselAngle,
      getSize: (d: ApiVessel) => vesselIconSize(d, backend?.selectedMmsi),
      sizeUnits: 'meters',
      sizeMinPixels: 10,
      sizeMaxPixels: 34,
      getColor: (d: ApiVessel) => vesselColor(d, backend?.selectedMmsi),
      pickable: true,
      onClick: ({ object }: any) => object?.mmsi && onSelectMmsi?.(object.mmsi),
    }),
    new ScatterplotLayer({
      id: 'selected-dark-event',
      data: darkEvents.filter((event) => event.mmsi === backend?.selectedMmsi),
      getPosition: darkEventPosition,
      getRadius: 900,
      radiusMinPixels: 10,
      radiusMaxPixels: 26,
      getFillColor: [245, 158, 11, 75],
      getLineColor: [245, 158, 11, 245],
      lineWidthMinPixels: 3,
      stroked: true,
      pickable: true,
      onClick: ({ object }: any) => object?.mmsi && onSelectMmsi?.(object.mmsi),
      billboard: true,
    }),
    new ScatterplotLayer({
      id: 'scenario-track-heads',
      data: backend?.isBackendOnline ? [] : scenario.vesselTracks.map((track) => ({ ...track, position: track.path[track.path.length - 1] })),
      getPosition: (d: any) => d.position,
      getRadius: 1100,
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      getFillColor: (d: any) => d.severity === 'HIGH' ? [245, 158, 11, 190] : [120, 150, 185, 150],
      getLineColor: [255, 255, 255, 220],
      lineWidthMinPixels: 1,
      stroked: true,
      billboard: true,
    }),
    new PathLayer({
      id: 'live-ais-trails',
      data: showTrails ? liveVessels.filter((v) => v.track?.length > 1) : [],
      getPath: (d: any) => d.track,
      getColor: [125, 211, 252, 160],
      getWidth: 1.5,
      widthMinPixels: 1,
      rounded: true,
    }),
    new ScatterplotLayer({
      id: 'live-ais-vessels',
      data: liveVessels,
      getPosition: (d: any) => [d.lng, d.lat],
      getRadius: (d: any) => (d.sog != null && d.sog < 1 ? 500 : 350),
      radiusMinPixels: 6,
      radiusMaxPixels: 14,
      getFillColor: (d: any) => d.sog != null && d.sog < 1 ? [251, 191, 36, 220] : [29, 78, 216, 235],
      getLineColor: [255, 255, 255, 210],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      onClick: ({ object }: any) => object?.mmsi && onSelectMmsi?.(Number(object.mmsi)),
      billboard: true,
    }),
    new TextLayer({
      id: 'backend-labels',
      data: [
        ...backendVessels.filter((v) => v.mmsi === backend?.selectedMmsi).map((v) => ({ text: `${v.vessel_name || v.mmsi}`, position: vesselPosition(v) })),
        ...darkEvents.filter((e) => e.mmsi === backend?.selectedMmsi && !backendVessels.some((v) => v.mmsi === e.mmsi)).map((e) => ({ text: e.vessel_name || `${e.mmsi}`, position: darkEventPosition(e) })),
      ],
      getPosition: (d: any) => d.position,
      getText: (d: any) => d.text,
      getSize: 11,
      getColor: [226, 232, 240, 240],
      getPixelOffset: [0, -18],
      background: true,
      getBackgroundColor: [6, 9, 15, 225],
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
      getBackgroundColor: [6, 9, 15, 220],
      backgroundPadding: [4, 2],
    }),
    new TextLayer({
      id: 'sandbox-labels',
      data: [
        ...(sandboxTarget ? [{ text: `LAST AIS ${sandboxTarget.id}`, position: sandboxTarget.lastAisPosition }] : []),
        ...(sandboxObservation ? [{ text: `SIM ${sandboxObservation.sensorId} HIT`, position: sandboxObservation.position }] : []),
      ],
      getPosition: (d: any) => d.position,
      getText: (d: any) => d.text,
      getSize: 11,
      getColor: [226, 232, 240, 240],
      getPixelOffset: [0, -20],
      background: true,
      getBackgroundColor: [3, 7, 18, 230],
      backgroundPadding: [5, 3],
    }),
    new TextLayer({
      id: 'scenario-labels',
      data: backend?.isBackendOnline ? [] : scenario.vesselTracks.map((track) => ({ text: track.id, position: track.path[track.path.length - 1] })),
      getPosition: (d: any) => d.position,
      getText: (d: any) => d.text,
      getSize: 12,
      getColor: [226, 232, 240, 235],
      getPixelOffset: [0, -18],
      background: true,
      getBackgroundColor: [6, 9, 15, 220],
      backgroundPadding: [5, 3],
    }),
  ];

  return <div className="tactical-map-shell">
    <DeckGL
      initialViewState={{ longitude: scenario.center[0], latitude: scenario.center[1], zoom: initialZoom, pitch: 34, bearing: -18 }}
      controller={true}
      layers={layers}
      getTooltip={vesselTooltip}
    >
      <Map mapStyle={mapStyle as any} />
    </DeckGL>
    <div className="basemap-toggle" aria-label="Basemap toggle">
      {(Object.keys(BASEMAPS) as BasemapKey[]).map((key) => <button
        key={key}
        className={key === basemap ? 'active' : ''}
        onClick={() => setBasemap(key)}
      >{BASEMAPS[key].label}</button>)}
    </div>
    <div className="trails-toggle basemap-toggle" aria-label="Trails toggle">
      <button
        className={showTrails ? 'active' : ''}
        onClick={() => setShowTrails((v) => !v)}
      >Trails {showTrails ? 'On' : 'Off'}</button>
    </div>
  </div>;
}
