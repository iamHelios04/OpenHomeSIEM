// === filename: frontend/src/components/charts/TopDomainsChart.jsx ===
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Horizontal chart for the ten most frequently queried domains. */
export default function TopDomainsChart({ data = [] }) {
  return <div className="chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 4, right: 14, left: 12, bottom: 4 }}><CartesianGrid stroke="#27313b" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: '#82909e', fontSize: 9 }} axisLine={{ stroke: '#303944' }} tickLine={false} /><YAxis type="category" dataKey="domain" width={140} tick={{ fill: '#a8b5c2', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#111820', border: '1px solid #303944', borderRadius: 7, color: '#e6edf3', fontSize: 10 }} /><Bar dataKey="count" name="Queries" radius={[0, 4, 4, 0]} barSize={11} isAnimationActive={false}>{data.map((item) => <Cell key={item.domain} fill={item.suspicious ? '#f85149' : '#2f81f7'} />)}</Bar></BarChart></ResponsiveContainer></div>;
}
