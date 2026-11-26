// === filename: frontend/src/components/charts/EventsTimelineChart.jsx ===
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const series = [
  ['dhcp', '#bc8cff'], ['dns', '#39d5ff'], ['kernel', '#d29922'], ['firewall', '#f85149'], ['system', '#8b949e'], ['ppp', '#3fb950'],
];

/** Multi-series area chart for event volume over time. */
export default function EventsTimelineChart({ data = [] }) {
  return <div className="chart-canvas"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 9, left: -18, bottom: 0 }}><defs>{series.map(([key, color]) => <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.38} /><stop offset="95%" stopColor={color} stopOpacity={0.02} /></linearGradient>)}</defs><CartesianGrid strokeDasharray="3 3" stroke="#27313b" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#82909e', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#303944' }} tickLine={false} minTickGap={28} /><YAxis allowDecimals={false} tick={{ fill: '#82909e', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#111820', border: '1px solid #303944', borderRadius: 7, color: '#e6edf3', fontSize: 10 }} /><Legend wrapperStyle={{ fontSize: 9, color: '#a7b1bc' }} />{series.map(([key, color]) => <Area key={key} type="monotone" dataKey={key} name={key.toUpperCase()} stroke={color} fill={`url(#gradient-${key})`} strokeWidth={1.7} dot={false} isAnimationActive={false} />)}</AreaChart></ResponsiveContainer></div>;
}
