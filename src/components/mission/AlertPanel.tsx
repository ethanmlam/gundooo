import { missionScenario } from '../../data/scenario';

export function AlertPanel() {
  return <div className="panel alert-panel">
    <div className="panel-title">Anomaly queue</div>
    {missionScenario.alerts.map((alert) => <div className={`alert-row ${alert.severity.toLowerCase()}`} key={alert.title}>
      <b>{alert.severity}</b>
      <div>
        <h3>{alert.title}</h3>
        <p>{alert.time} · {alert.source}</p>
      </div>
    </div>)}
  </div>;
}
