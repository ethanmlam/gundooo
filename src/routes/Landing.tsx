import { Link } from 'react-router-dom';
import { Activity, Globe2, Radar, Ship, AlertTriangle } from 'lucide-react';

export default function Landing() {
  return <main className="landing">
    <div className="landing-bg" />
    <nav className="landing-nav">
      <div className="logo"><Radar size={16}/> GUNDOOO</div>
    </nav>
    <section className="hero">
      <div>
        <p className="eyebrow">MARITIME DARK VESSEL TRIAGE</p>
        <h1>140 vessels went dark. Which one do you care about?</h1>
        <p className="hero-copy">GUNDOOO triages AIS dark events by threat level, predicts vessel location with particle filters, and optimizes sensor tasking — built on real NOAA AIS data from Long Beach.</p>
        <div className="hero-actions">
          <Link to="/theaters">ENTER WATCHFLOOR</Link>
        </div>
      </div>
      <div className="hero-card">
        <div className="scan-ring"><Globe2 size={48}/></div>
        <div className="hero-stat"><Ship size={16}/><b>607</b><span>vessels tracked</span></div>
        <div className="hero-stat"><AlertTriangle size={16}/><b>140</b><span>dark events</span></div>
        <div className="hero-stat hot"><Activity size={16}/><b>32</b><span>correlated pairs</span></div>
      </div>
    </section>
  </main>;
}
