import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Globe2, Radar, Ship, Plane, Search } from 'lucide-react';

export default function Landing() {
  return <main className="landing">
    <div className="landing-bg" />
    <nav className="landing-nav">
      <div className="logo"><Radar size={22}/> Gundooo</div>
      <div className="nav-badges"><span>AIS</span><span>ADS-B</span><span>RadarSim</span><span>NL Query</span></div>
    </nav>
    <section className="hero">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <p className="eyebrow">Live OSINT world model</p>
        <h1>Profile every vessel moving through the Strait of Hormuz.</h1>
        <p className="hero-copy">Gundooo turns Hormuz AIS, simulated radar, and OSINT context into ship-by-ship dossiers: movement, identity, risk, evidence, and recommended follow-up.</p>
        <div className="hero-actions">
          <Link to="/mission/strait-of-hormuz">Launch Hormuz Watchfloor</Link>
          <span>Front-end demo with mock feeds, built to connect real AIS / ADS-B later.</span>
        </div>
      </motion.div>
      <motion.div className="hero-card" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
        <div className="scan-ring"><Globe2 size={86}/></div>
        <div className="hero-stat"><Ship size={18}/><b>1,284</b><span>vessel tracks</span></div>
        <div className="hero-stat"><Plane size={18}/><b>187</b><span>air tracks</span></div>
        <div className="hero-stat hot"><Activity size={18}/><b>12</b><span>anomalies</span></div>
        <div className="query-pill"><Search size={15}/> profile ships slowing inside the Strait of Hormuz</div>
      </motion.div>
    </section>
  </main>;
}
