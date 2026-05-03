import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  Compass03Icon,
  Database03Icon,
  RouteIcon,
  Signal03Icon,
  Target05Icon,
  ZapFastIcon,
} from '@untitledui/icons-react/outline';
import { TacticalMap } from '../components/mission/TacticalMap';
import { theaters } from '../data/theaters';
import { missionScenario, scenariosByTheater, type MissionScenario } from '../data/scenario';
import { getRecommendedSandboxSensor, hormuzSensorSandbox, type HormuzSensorSandbox } from '../data/sensorSandbox';
import { useAppStore } from '../lib/store';
import { useBackendData, useSearchLoop, type BackendState, type SearchLoopData } from '../lib/backendApi';
import { useLiveAis, type LiveAisSnapshot, type LiveAisVessel } from '../lib/useLiveAis';

type SidebarProps = {
  theater: typeof theaters[number];
  scenario: MissionScenario;
  backend: BackendState;
};

function formatDuration(hours?: number) {
  if (hours == null) return 'unknown';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} hr`;
}

function isHormuzScenario(scenario: MissionScenario) {
  return scenario.id === 'strait-of-hormuz' || scenario.id === 'persian-gulf';
}

function StraitSummary({ theater, scenario, backend }: SidebarProps) {
  return <section className="stripe-card hero-card-mini">
    <div className="stripe-card-head">
      <div className="icon-tile warm"><Compass03Icon width={17} height={17}/></div>
      <div><span>Watch area</span><h3>{theater.name}</h3></div>
      <b className={`status-pill ${theater.risk.toLowerCase()}`}>{theater.risk}</b>
    </div>
    <p>Ship-by-ship profiling and sensor tasking for vessels transiting the chokepoint.</p>
    <div className="sidebar-metrics">
      <div><b>{backend.vessels.length || scenario.vesselTracks.length}</b><span>tracked</span></div>
      <div><b>{backend.darkEvents.length || 2}</b><span>flagged</span></div>
      <div><b>{backend.isBackendOnline ? 'api' : 'demo'}</b><span>mode</span></div>
    </div>
  </section>;
}

function SourceProvenanceCard({ sandbox }: { sandbox: HormuzSensorSandbox }) {
  return <section className="stripe-card compact-card">
    <div className="stripe-card-head compact">
      <div className="icon-tile"><Database03Icon width={17} height={17}/></div>
      <div><span>Provenance</span><h3>Exercise data, labeled sources</h3></div>
    </div>
    <div className="source-list">
      {sandbox.sources.map((source) => <div className="source-row" key={source.name}>
        <span className={`source-dot ${source.status === 'cached' ? 'online' : 'ready'}`} />
        <div><b>{source.name}</b><p>{source.detail}</p></div>
        <em>{source.status}</em>
      </div>)}
    </div>
  </section>;
}

function ShipRosterCard({ snapshot, backend, scenario }: { snapshot: LiveAisSnapshot; backend: BackendState; scenario: MissionScenario }) {
  const setSelectedMmsi = useAppStore((s) => s.setSelectedMmsi);
  const liveShips = snapshot.vessels.slice(0, 10);
  const backendShips = backend.vessels.slice(0, 10);
  const scenarioShips = scenario.vesselTracks.slice(0, 6).map((v, idx) => ({
    key: v.id,
    mmsi: 309253000 + idx,
    name: v.id,
    detail: `${v.kind} · ${v.severity.toLowerCase()} flag`,
  }));
  const rows = liveShips.length ? liveShips.map((v) => ({
    key: v.mmsi,
    mmsi: Number(v.mmsi),
    name: v.name || v.label || v.mmsi,
    detail: `${v.sog?.toFixed?.(1) ?? '?'} kn · ${v.cog?.toFixed?.(0) ?? v.heading ?? '?'}°`,
  })) : backendShips.length ? backendShips.map((v) => ({
    key: String(v.mmsi),
    mmsi: v.mmsi,
    name: v.vessel_name || String(v.mmsi),
    detail: `${v.last_position.speed_knots?.toFixed?.(1) ?? '?'} kn · ${v.last_position.heading ?? '?'}°`,
  })) : scenarioShips;

  return <section className="data-section" style={{ padding: 0, overflow: 'hidden' }}>
    <div style={{ padding: '10px 12px 6px' }}>
      <span className="section-label">Ships</span>
      <h3 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{rows.length} profiles</h3>
    </div>
    <div className="ship-roster">
      {rows.map((ship) => <button key={ship.key} onClick={() => setSelectedMmsi(ship.mmsi)} className={ship.mmsi === backend.selectedMmsi ? 'selected' : ''}>
        <b>{ship.name}</b><span>MMSI {ship.mmsi}</span><em>{ship.detail}</em>
      </button>)}
    </div>
  </section>;
}

function NextStepCard({ backend, searchLoop, showAfterPolygon, onSimulate }: { backend: BackendState; searchLoop: SearchLoopData | null; showAfterPolygon: boolean; onSimulate: () => void }) {
  const hasPrediction = backend.prediction && backend.predictedMmsi === backend.selectedMmsi;
  return <section className="data-section">
    <span className="section-label">Prediction</span>
    <h3 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 4 }}>{hasPrediction ? 'Projected path active' : 'Project selected vessel'}</h3>
    <p>{hasPrediction ? 'Cloud is based on this selected boat.' : 'Run inference for the currently selected boat.'}</p>
    <button className="primary-action" onClick={backend.predict} disabled={backend.isPredicting}>
      <ZapFastIcon width={15} height={15}/> {backend.isPredicting ? 'Projecting...' : 'Run prediction'}
    </button>
    {hasPrediction && searchLoop && <>
      <button className="primary-action" onClick={onSimulate} disabled={showAfterPolygon} style={{ marginTop: 6 }}>
        <Target05Icon width={15} height={15}/> {showAfterPolygon ? 'Sensor update applied' : 'Simulate sensor update'}
      </button>
      {showAfterPolygon && <p className="mono" style={{ marginTop: 6, fontSize: '11px', fontWeight: 600, opacity: 0.85 }}>
        {searchLoop.recommended_sensor.sensor_id} recommended · {Math.round(searchLoop.area_reduction_pct)}% area reduction
      </p>}
    </>}
  </section>;
}

function SensorSandboxCard({ sandbox, applied, onApply, onReset }: { sandbox: HormuzSensorSandbox; applied: boolean; onApply: () => void; onReset: () => void }) {
  const sensor = getRecommendedSandboxSensor(sandbox);
  return <section className="stripe-card compact-card sensor-tasking-card">
    <div className="stripe-card-head compact">
      <div className="icon-tile green"><Target05Icon width={17} height={17}/></div>
      <div><span>Sensor sandbox</span><h3>{applied ? 'Observation applied' : sensor.action}</h3></div>
    </div>
    <p>{sensor.rationale}</p>
    <div className="sensor-recommendation">
      <div><span>Sensor</span><b>{sensor.id}</b><p>{sensor.resolution} · {sensor.revisitMinutes} min revisit</p></div>
      <div><span>Confidence</span><b>{sensor.confidence}%</b><p>{sensor.weatherSensitivity} weather sensitivity</p></div>
    </div>
    <button className="primary-action" onClick={onApply} disabled={applied}>
      <Target05Icon width={15} height={15}/> {applied ? 'Sensor hit on map' : 'Simulate sensor hit'}
    </button>
    {applied && <button className="secondary-action" onClick={onReset}>Reset sandbox</button>}
    <p className="mono sandbox-note">{applied ? `${sandbox.observation.sensorId} hit · ${sandbox.observation.areaReductionPct}% search-area reduction` : 'All sensor actions are simulated for the exercise environment.'}</p>
  </section>;
}

function WeatherCard({ sandbox }: { sandbox: HormuzSensorSandbox }) {
  const { weather } = sandbox;
  return <section className="stripe-card compact-card">
    <div className="stripe-card-head compact">
      <div className="icon-tile"><Signal03Icon width={17} height={17}/></div>
      <div><span>Weather</span><h3>{weather.source}</h3></div>
    </div>
    <div className="weather-grid">
      <div><b>{weather.windKnots}</b><span>kt wind</span></div>
      <div><b>{weather.visibilityKm}</b><span>km vis</span></div>
      <div><b>{weather.cloudCoverPct}</b><span>% cloud</span></div>
    </div>
    <p>{weather.effect}</p>
  </section>;
}

function profileFromLive(vessel: LiveAisVessel | undefined, selectedMmsi: number) {
  if (!vessel) return null;
  const speed = vessel.sog ?? 0;
  const status = speed < 1 ? 'stopped/holding' : speed < 6 ? 'slow transit' : 'normal transit';
  const risk = speed < 1 ? 76 : speed < 6 ? 61 : 34;
  return {
    title: vessel.name || vessel.label || `MMSI ${selectedMmsi}`,
    subtitle: `MMSI ${selectedMmsi}`,
    risk,
    status,
    movement: `${speed.toFixed(1)} kn · course ${vessel.cog?.toFixed?.(0) ?? vessel.heading ?? '?'}°`,
    lastSeen: vessel.lastSeen,
    location: `${vessel.lat.toFixed(4)}, ${vessel.lng.toFixed(4)}`,
    evidence: [
      'Latest AIS point in the selected feed region',
      `Speed classified as ${status}`,
      `${vessel.track?.length ?? 1} recent points retained for trail`,
      'Next enrichment: registry, ownership, cargo, sanctions, destination',
    ],
  };
}

function VesselProfile({ backend, snapshot }: { backend: BackendState; snapshot: LiveAisSnapshot }) {
  const selectedVessel = backend.vessels.find((v) => v.mmsi === backend.selectedMmsi);
  const selectedEvent = backend.darkEvents.find((event) => event.mmsi === backend.selectedMmsi);
  const liveProfile = profileFromLive(snapshot.vessels.find((v) => Number(v.mmsi) === backend.selectedMmsi), backend.selectedMmsi);
  const title = liveProfile?.title || selectedVessel?.vessel_name || selectedEvent?.vessel_name || `MMSI ${backend.selectedMmsi}`;
  const evidence = liveProfile?.evidence ?? [
    selectedEvent ? `Dark for ${formatDuration(selectedEvent.duration_hours)}` : 'Scenario vessel selected',
    `Movement: ${selectedVessel?.last_position.speed_knots?.toFixed?.(1) ?? selectedEvent?.last_known_speed?.toFixed?.(1) ?? '13.2'} kn`,
    'Deviation from nearest shipping lane analyzed',
    'Flag state risk: non-US registry flagged',
  ];

  return <aside className="c2-right panel vessel-profile-panel">
    <div className="profile-score"><span>Threat score</span><b>{liveProfile?.risk ?? (selectedEvent ? 82 : 48)}</b><em>{liveProfile?.status ?? 'classified by ML model'}</em></div>
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="section-label">Vessel</span>
      <h2 style={{ padding: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
      <p style={{ padding: 0, marginTop: 4 }}>{liveProfile?.subtitle || selectedVessel?.vessel_type || selectedEvent?.vessel_type || 'Click any ship to inspect it.'}</p>
    </div>
    <div className="evidence-panel minimal-evidence">
      <div className="panel-title" style={{ padding: '10px 12px 6px' }}>Why this matters</div>
      {evidence.map((item) => <div className="evidence-row" key={item}><span />{item}</div>)}
    </div>
    <div className="identity-card">
      <div><span>MMSI</span><b>{backend.selectedMmsi}</b></div>
      <div><span>Last seen</span><b>{liveProfile?.location || (selectedVessel ? `${selectedVessel.last_position.lat.toFixed(3)}, ${selectedVessel.last_position.lon.toFixed(3)}` : selectedEvent ? `${selectedEvent.last_known_lat.toFixed(3)}, ${selectedEvent.last_known_lon.toFixed(3)}` : 'scenario track')}</b></div>
      <div><span>Movement</span><b>{liveProfile?.movement || `${selectedVessel?.last_position.speed_knots?.toFixed?.(1) ?? selectedEvent?.last_known_speed?.toFixed?.(1) ?? '13.2'} kn`}</b></div>
    </div>
  </aside>;
}

export default function Mission() {
  const { theaterId = 'strait-of-hormuz' } = useParams();
  const theater = theaters.find((t) => t.id === theaterId) ?? theaters.find((t) => t.id === 'strait-of-hormuz') ?? theaters[0];
  const scenario = scenariosByTheater[theater.id] ?? missionScenario;
  const isHormuz = isHormuzScenario(scenario);
  const selectedMmsi = useAppStore((s) => s.selectedMmsi);
  const setSelectedMmsi = useAppStore((s) => s.setSelectedMmsi);
  const backend = useBackendData(selectedMmsi);
  const displayBackend = isHormuz ? { ...backend, vessels: [], darkEvents: [], isBackendOnline: false, isLoading: false, statusText: 'Hormuz exercise sandbox' } : backend;
  const hasPrediction = backend.prediction != null && backend.predictedMmsi === backend.selectedMmsi;
  const searchLoop = useSearchLoop(hasPrediction ? backend.selectedMmsi : null, backend.searchLoopEnabled);
  const [showAfterPolygon, setShowAfterPolygon] = useState(false);
  const [sandboxApplied, setSandboxApplied] = useState(false);
  useEffect(() => setShowAfterPolygon(false), [selectedMmsi]);
  useEffect(() => setSandboxApplied(false), [theater.id]);
  const liveEnabled = !backend.isBackendOnline && !isHormuz && (scenario.id === 'strait-of-hormuz' || scenario.id === 'persian-gulf');
  const { snapshot } = useLiveAis(liveEnabled);
  const displaySnapshot = isHormuz ? { ...snapshot, vessels: [] } : snapshot;
  const isInitialLoad = !isHormuz && backend.isLoading && !backend.isBackendOnline;
  const trackedCount = displayBackend.vessels.length || scenario.vesselTracks.length;
  const flaggedCount = displayBackend.darkEvents.length || 2;

  return <main className="mission-page c2-layout lean-layout">
    <header className="mission-topbar panel">
      <Link to="/theaters"><ArrowLeftIcon width={15} height={15}/> Theaters</Link>
      <div><h1>GUNDOOO / {theater.name} {isHormuz ? 'Sensor Sandbox' : 'Vessel Watch'}</h1><p>{isHormuz ? 'Exercise environment: cached AIS-style tracks, weather context, simulated sensor tasking, and model search regions.' : 'Ships on the map are pre-profiled by movement, vessel type, and chokepoint context.'}</p></div>
      <div className="topbar-metrics">
        <div><b>{trackedCount}</b><span>tracked</span></div>
        <div><b>{flaggedCount}</b><span>flagged</span></div>
      </div>
    </header>

    {isInitialLoad
      ? <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: '60vh', opacity: 0.7 }}>
          <Signal03Icon width={36} height={36} className="loading-pulse" />
          <p style={{ fontSize: 14, letterSpacing: '0.05em' }}>Loading vessel data...</p>
          <p style={{ fontSize: 12, opacity: 0.5 }}>This usually takes 10-15 seconds</p>
        </div>
      : <>
        <aside className="c2-left panel production-sidebar lean-sidebar">
          <StraitSummary theater={theater} scenario={scenario} backend={displayBackend} />
          {isHormuz && <SourceProvenanceCard sandbox={hormuzSensorSandbox} />}
          <ShipRosterCard snapshot={displaySnapshot} backend={displayBackend} scenario={scenario} />
          {isHormuz
            ? <>
                <SensorSandboxCard sandbox={hormuzSensorSandbox} applied={sandboxApplied} onApply={() => setSandboxApplied(true)} onReset={() => setSandboxApplied(false)} />
                <WeatherCard sandbox={hormuzSensorSandbox} />
              </>
            : <NextStepCard backend={backend} searchLoop={searchLoop} showAfterPolygon={showAfterPolygon} onSimulate={() => setShowAfterPolygon(true)} />}
        </aside>

        <section className="c2-map panel">
          <div className="map-title"><b>{theater.name} {isHormuz ? 'sensor tasking' : 'traffic'}</b><span>{isHormuz ? 'simulated SAR/radar/UAV coverage' : 'click a ship to profile'}</span></div>
          <TacticalMap
            scenario={scenario}
            backend={isHormuz ? undefined : backend}
            onSelectMmsi={setSelectedMmsi}
            searchLoop={searchLoop}
            showAfterPolygon={showAfterPolygon}
            sensorSandbox={isHormuz ? hormuzSensorSandbox : undefined}
            showSensorResult={isHormuz ? sandboxApplied : showAfterPolygon}
          />
        </section>

        <VesselProfile backend={backend} snapshot={snapshot} />
      </>}
  </main>;
}
