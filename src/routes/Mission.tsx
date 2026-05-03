import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  Signal03Icon,
  Target05Icon,
  ZapFastIcon,
} from '@untitledui/icons-react/outline';
import { TacticalMap } from '../components/mission/TacticalMap';
import { theaters } from '../data/theaters';
import { missionScenario, scenariosByTheater, type MissionScenario } from '../data/scenario';
import { useAppStore } from '../lib/store';
import { useBackendData, useSearchLoop, type BackendState, type SearchLoopData } from '../lib/backendApi';
import { useLiveAis, type LiveAisSnapshot, type LiveAisVessel } from '../lib/useLiveAis';

function formatDuration(hours?: number) {
  if (hours == null) return 'unknown';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} hr`;
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
  const selectedMmsi = useAppStore((s) => s.selectedMmsi);
  const setSelectedMmsi = useAppStore((s) => s.setSelectedMmsi);
  const backend = useBackendData(selectedMmsi);
  const hasPrediction = backend.prediction != null && backend.predictedMmsi === backend.selectedMmsi;
  const searchLoop = useSearchLoop(hasPrediction ? backend.selectedMmsi : null, backend.searchLoopEnabled);
  const [showAfterPolygon, setShowAfterPolygon] = useState(false);
  useEffect(() => setShowAfterPolygon(false), [selectedMmsi]);
  const liveEnabled = !backend.isBackendOnline && (scenario.id === 'strait-of-hormuz' || scenario.id === 'persian-gulf');
  const { snapshot } = useLiveAis(liveEnabled);

  const isInitialLoad = backend.isLoading && !backend.isBackendOnline;
  const vesselName = (() => {
    const sel = backend.vessels.find((v) => v.mmsi === backend.selectedMmsi);
    const evt = backend.darkEvents.find((e) => e.mmsi === backend.selectedMmsi);
    return sel?.vessel_name || evt?.vessel_name || `MMSI ${backend.selectedMmsi}`;
  })();

  return <main className="mission-page c2-layout lean-layout">
    <header className="mission-topbar panel">
      <Link to="/theaters"><ArrowLeftIcon width={15} height={15}/></Link>
      <div>
        <h1>
          <span className="breadcrumb-sep">GUNDOOO</span>
          <span className="breadcrumb-sep"> / </span>
          <span className="breadcrumb-sep">{theater.name}</span>
          <span className="breadcrumb-sep"> / </span>
          <span className="breadcrumb-current">{vesselName}</span>
        </h1>
      </div>
      <div className="stat-boxes">
        <div className="stat-box"><b>{backend.vessels.length || scenario.vesselTracks.length}</b><span>tracked</span></div>
        <div className="stat-box"><b>{backend.darkEvents.length || 2}</b><span>flagged</span></div>
      </div>
      <div className="mission-status"><span /> {isInitialLoad ? 'CONNECTING' : backend.isBackendOnline ? 'LIVE API' : 'REPLAY'}</div>
    </header>

    {isInitialLoad
      ? <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: '60vh', opacity: 0.7 }}>
          <Signal03Icon width={36} height={36} className="loading-pulse" />
          <p style={{ fontSize: 14, letterSpacing: '0.05em' }}>Loading vessel data...</p>
          <p style={{ fontSize: 12, opacity: 0.5 }}>This usually takes 10-15 seconds</p>
        </div>
      : <>
        <aside className="c2-left panel production-sidebar lean-sidebar">
          <ShipRosterCard snapshot={snapshot} backend={backend} scenario={scenario} />
          <NextStepCard backend={backend} searchLoop={searchLoop} showAfterPolygon={showAfterPolygon} onSimulate={() => setShowAfterPolygon(true)} />
        </aside>

        <section className="c2-map panel">
          <div className="map-title"><b>{theater.name} traffic</b><span>click a ship to profile</span></div>
          <TacticalMap scenario={scenario} backend={backend} onSelectMmsi={setSelectedMmsi} searchLoop={searchLoop} showAfterPolygon={showAfterPolygon} />
        </section>

        <VesselProfile backend={backend} snapshot={snapshot} />
      </>}
  </main>;
}
