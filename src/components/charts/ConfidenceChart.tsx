import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { missionScenario, type MissionScenario } from '../../data/scenario';

export function ConfidenceChart({ scenario = missionScenario }: { scenario?: MissionScenario }) {
  return <ResponsiveContainer width="100%" height={118}>
    <BarChart data={scenario.confidence} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
      <XAxis type="number" hide domain={[0, 100]} />
      <YAxis type="category" dataKey="name" width={62} tick={{ fill: '#9aa3b1', fontSize: 10 }} axisLine={false} tickLine={false} />
      <Bar dataKey="value" fill="#38bdf8" radius={[0, 4, 4, 0]} />
    </BarChart>
  </ResponsiveContainer>;
}
