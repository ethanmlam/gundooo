import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { missionScenario, type MissionScenario } from '../../data/scenario';

export function FeedVolumeChart({ scenario = missionScenario }: { scenario?: MissionScenario }) {
  return <ResponsiveContainer width="100%" height={140}>
    <LineChart data={scenario.feedVolume} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
      <XAxis dataKey="t" tick={{ fill: '#7f8794', fontSize: 10 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fill: '#7f8794', fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={{ background: '#07090d', border: '1px solid #242936', borderRadius: 8 }} />
      <Line type="monotone" dataKey="AIS" stroke="#5c9ac5" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="ADSB" stroke="#d4a552" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="Radar" stroke="#f59e0b" strokeWidth={2} dot={false} />
    </LineChart>
  </ResponsiveContainer>;
}
