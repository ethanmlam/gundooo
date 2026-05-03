import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Globe2, Radar, Ship, AlertTriangle } from 'lucide-react';

export default function Landing() {
  return <main className="landing">
    <div className="landing-bg" />
    <nav className="landing-nav">
      <div className="logo"><Radar size={22}/> Gundooo</div>
    </nav>
    <section className="hero">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <p className="eyebrow">MARITIME DARK VESSEL TRIAGE</p>
        <h1>140 vessels went dark. Which one do you care about?</h1>
        <p className="hero-copy">GUNDOOO triages AIS dark events by threat level, predicts vessel location with particle filters, and optimizes sensor tasking — built on real NOAA AIS data from Long Beach.</p>
        <div className="hero-actions">
          <Link to="/theaters">Enter Watchfloor</Link>
        </div>
      </motion.div>
      <motion.div className="hero-card" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
        <div className="scan-ring"><Globe2 size={86}/></div>
        <div className="hero-stat"><Ship size={18}/><b>607</b><span>vessels tracked</span></div>
        <div className="hero-stat"><AlertTriangle size={18}/><b>140</b><span>dark events</span></div>
        <div className="hero-stat hot"><Activity size={18}/><b>32</b><span>correlated pairs</span></div>
      </motion.div>
    </section>
  </main>;
}
