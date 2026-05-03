import { useNavigate } from 'react-router-dom';
import { TheaterGlobe } from '../components/globe/TheaterGlobe';
import { theaters } from '../data/theaters';

export default function TheaterSelect() {
  const navigate = useNavigate();
  return <main className="theater-page">
    <header className="app-header">
      <div><h1>Gundo</h1></div>
    </header>
    <section className="globe-shell minimal-globe-shell">
      <div className="globe-card"><TheaterGlobe theaters={theaters} onSelect={(t) => navigate(`/mission/${t.id}`)} /></div>
      <aside className="theater-list panel selector-sidebar simple-selector">
        <div className="selector-heading">
          <span>Choose theater</span>
        </div>
        {theaters.map((theater) => <button className="theater-row" key={theater.id} onClick={() => navigate(`/mission/${theater.id}`)}>
          <div className={`risk ${theater.risk.toLowerCase()}`}>{theater.risk}</div>
          <div><h3>{theater.name}</h3><p>{theater.summary}</p></div>
        </button>)}
      </aside>
    </section>
  </main>;
}
