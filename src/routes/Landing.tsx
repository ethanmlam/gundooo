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
        <p className="eyebrow">HORMUZ SENSOR TASKING SANDBOX</p>
        <h1>A tanker goes AIS-dark. What do you task next?</h1>
        <p className="hero-copy">GUNDOOO helps a commander maintain custody after AIS disappears: rank the missing vessel, project the search area, choose a sensor action, and simulate the observation result in a labeled exercise environment.</p>
        <div className="hero-actions">
          <Link to="/theaters">ENTER WATCHFLOOR</Link>
        </div>
      </div>
      <div className="hero-card">
        <div className="scan-ring"><Globe2 size={48}/></div>
        <div className="hero-stat"><Ship size={16}/><b>1</b><span>missing vessel sandbox</span></div>
        <div className="hero-stat"><AlertTriangle size={16}/><b>5</b><span>simulated sensor actions</span></div>
        <div className="hero-stat hot"><Activity size={16}/><b>72%</b><span>search area reduction</span></div>
      </div>
    </section>
  </main>;
}
