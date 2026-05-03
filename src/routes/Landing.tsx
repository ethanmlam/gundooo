import { Link } from 'react-router-dom';
import { Radar } from 'lucide-react';

export default function Landing() {
  return <main className="landing">
    <nav className="landing-nav">
      <div className="logo"><Radar size={16}/> GUNDOOO</div>
    </nav>
    <section className="hero">
      <div>
        <p className="eyebrow">MARITIME DARK VESSEL TRIAGE</p>
        <h1>140 vessels went dark. Which one do you care about?</h1>
        <p className="hero-copy">GUNDOOO triages AIS dark events by threat level, predicts vessel location with particle filters, and optimizes sensor tasking — built on real NOAA AIS data from Long Beach.</p>
        <p className="hero-stats">607 TRACKED · 140 DARK EVENTS · 32 CORRELATED</p>
        <div className="hero-actions">
          <Link to="/theaters">ENTER WATCHFLOOR</Link>
        </div>
      </div>
    </section>
  </main>;
}
