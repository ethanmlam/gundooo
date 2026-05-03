import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
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
import { useAppStore } from '../lib/store';
import { useBackendData, type BackendState } from '../lib/backendApi';
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

function StraitSummary({ theater, scenario, backend }: SidebarProps) {
  return <section className="stripe-card hero-card-mini">
    <div className="stripe-card-head">
      <div className="icon-tile warm"><Compass03Icon width={17} height={17}/></div>
      <div><span>Watch area</span><h3>{theater.name}</h3></div>
      <b className={`status-pill ${theater.risk.toLowerCase()}`}>{theater.risk}</b>
    </div>
    <p>Ship-by-ship profiling for vessels transiting the chokepoint.</p>
    <div className="sidebar-metrics">
      <div><b>{backend.vessels.length || scenario.vesselTracks.length}</b><span>tracked</span></div>
      <div><b>{backend.darkEvents.length || 2}</b><span>flagged</span></div>
      <div><b>{backend.isBackendOnline ? 'api' : 'demo'}</b><span>mode</span></div>
    </div>
  </section>;
}

function FeedCard({ scenario, backend }: { scenario: MissionScenario; backend: BackendState }) {
  const liveEnabled = !backend.isBackendOnline && (scenario.id === 'strait-of-hormuz' || scenario.id === 'persian-gulf');
  const { snapshot, isFresh } = useLiveAis(liveEnabled);
  const label = backend.isBackendOnline ? 'Backend online' : liveEnabled ? `${snapshot.source ?? 'AIS feed'} · ${snapshot.vesselCount} vessels` : 'Replay scenario';
  return <section className="stripe-card compact-card">
    <div className="stripe-card-head compact">
      <div className="icon-tile"><Database03Icon width={17} height={17}/></div>
      <div><span>Feed</span><h3>{label}</h3></div>
    </div>
    <p>{backend.isBackendOnline ? 'Using backend vessel data.' : isFresh ? 'Recent AIS snapshot loaded.' : 'No fresh Hormuz AIS yet, using scenario data.'}</p>
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

  return <section className="stripe-card ship-roster-card essential-card">
    <div className="stripe-card-head compact">
      <div className="icon-tile"><RouteIcon width={17} height={17}/></div>
      <div><span>Ships</span><h3>{rows.length} profiles</h3></div>
    </div>
    <div className="ship-roster">
      {rows.map((ship) => <button key={ship.key} onClick={() => setSelectedMmsi(ship.mmsi)} className={ship.mmsi === backend.selectedMmsi ? 'selected' : ''}>
        <b>{ship.name}</b><span>MMSI {ship.mmsi}</span><em>{ship.detail}</em>
      </button>)}
    </div>
  </section>;
}

function NextStepCard({ backend }: { backend: BackendState }) {
  return <section className="stripe-card compact-card">
    <div className="stripe-card-head compact">
      <div className="icon-tile green"><ZapFastIcon width={17} height={17}/></div>
      <div><span>Next step</span><h3>{backend.prediction ? 'Review predicted corridor' : 'Profile selected vessel'}</h3></div>
    </div>
    <p>{backend.prediction ? 'Prediction is visible on the map.' : 'Open registry, ownership, destination, sanctions, and behavior history.'}</p>
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
    'Compare against Hormuz traffic separation lanes',
    'Enrich with registry and sanctions data when provider is connected',
  ];

  return <aside className="c2-right panel vessel-profile-panel">
    <div className="panel-title">Selected vessel</div>
    <h2>{title}</h2>
    <p>{liveProfile?.subtitle || selectedVessel?.vessel_type || selectedEvent?.vessel_type || 'Click any ship to inspect it.'}</p>
    <div className="profile-score"><span>Hormuz risk</span><b>{liveProfile?.risk ?? (selectedEvent ? 82 : 48)}</b><em>{liveProfile?.status ?? 'needs enrichment'}</em></div>
    <div className="identity-card">
      <div><span>MMSI</span><b>{backend.selectedMmsi}</b><p>primary identifier</p></div>
      <div><span>Last seen</span><b>{liveProfile?.location || (selectedVessel ? `${selectedVessel.last_position.lat.toFixed(3)}, ${selectedVessel.last_position.lon.toFixed(3)}` : selectedEvent ? `${selectedEvent.last_known_lat.toFixed(3)}, ${selectedEvent.last_known_lon.toFixed(3)}` : 'scenario track')}</b><p>{liveProfile?.lastSeen || selectedVessel?.last_position.timestamp || selectedEvent?.dark_start || 'replay'}</p></div>
      <div><span>Movement</span><b>{liveProfile?.movement || `${selectedVessel?.last_position.speed_knots?.toFixed?.(1) ?? selectedEvent?.last_known_speed?.toFixed?.(1) ?? '13.2'} kn`}</b><p>speed/course behavior</p></div>
    </div>
    <div className="evidence-panel minimal-evidence">
      <div className="panel-title">Why this matters</div>
      {evidence.map((item) => <div className="evidence-row" key={item}><span />{item}</div>)}
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
  const liveEnabled = !backend.isBackendOnline && (scenario.id === 'strait-of-hormuz' || scenario.id === 'persian-gulf');
  const { snapshot } = useLiveAis(liveEnabled);

  return <main className="mission-page c2-layout lean-layout">
    <header className="mission-topbar panel">
      <Link to="/theaters"><ArrowLeftIcon width={15} height={15}/> Theaters</Link>
      <div><h1>Gundooo | {theater.name} Vessel Watch</h1><p>Ships on the map are pre-profiled by movement, vessel type, and chokepoint context.</p></div>
      <div className="mission-status"><span /> {backend.isBackendOnline ? 'LIVE API' : 'REPLAY'}</div>
    </header>

    <aside className="c2-left panel production-sidebar lean-sidebar">
      <StraitSummary theater={theater} scenario={scenario} backend={backend} />
      <FeedCard scenario={scenario} backend={backend} />
      <ShipRosterCard snapshot={snapshot} backend={backend} scenario={scenario} />
      <NextStepCard backend={backend} />
    </aside>

    <section className="c2-map panel">
      <div className="map-title"><b>{theater.name} traffic</b><span>click a ship to profile</span></div>
      <TacticalMap scenario={scenario} backend={backend} onSelectMmsi={setSelectedMmsi} />
    </section>

    <VesselProfile backend={backend} snapshot={snapshot} />
  </main>;
}
