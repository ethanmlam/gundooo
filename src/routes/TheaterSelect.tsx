import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, ShieldZapIcon, WifiIcon } from '@untitledui/icons-react/outline';
import { TheaterGlobe } from '../components/globe/TheaterGlobe';
import { theaters } from '../data/theaters';

export default function TheaterSelect() {
  const navigate = useNavigate();
  return <main className="theater-page">
    <header className="app-header">
      <button onClick={() => navigate('/')}><ArrowLeftIcon width={15} height={15}/> Back</button>
      <div><h1>Theater selector</h1><p>Choose a live operating environment.</p></div>
    </header>
    <section className="globe-shell">
      <div className="globe-card"><TheaterGlobe theaters={theaters} onSelect={(t) => navigate(`/mission/${t.id}`)} /></div>
      <aside className="theater-list panel selector-sidebar">
        <div className="selector-heading">
          <span>Command surfaces</span>
          <h2>Operational theaters</h2>
          <p>Priority labels are collision-filtered, so chokepoints and active theaters stay readable first.</p>
        </div>
        {theaters.map((theater) => <button className="theater-row" key={theater.id} onClick={() => navigate(`/mission/${theater.id}`)}>
          <div className={`risk ${theater.risk.toLowerCase()}`}>{theater.risk}</div>
          <div><h3>{theater.name}</h3><p>{theater.summary}</p><span>{theater.feeds.join(' / ')}</span></div>
        </button>)}
      </aside>
      <div className="selector-note panel">
        <ShieldZapIcon width={20} height={20}/>
        <div><b>Demo focus</b><p>Hormuz is the primary product surface: ship profiles, chokepoint flow, slowdown detection, tasking corridors, and replay evidence.</p></div>
      </div>
      <div className="feed-note panel"><WifiIcon width={18} height={18}/> Feed simulation running at 60x replay speed</div>
    </section>
  </main>;
}
