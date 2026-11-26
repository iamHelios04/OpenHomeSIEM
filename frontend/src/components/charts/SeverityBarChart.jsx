// === filename: frontend/src/components/charts/SeverityBarChart.jsx ===
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Compact static severity distribution chart. */
export default function SeverityBarChart({ data = [] }) {
  return <div className="chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 9, left: -18, bottom: 0 }}><CartesianGrid stroke="#27313b" vertical={false} /><XAxis dataKey="severity" tick={{ fill: '#82909e', fontSize: 9 }} axisLine={{ stroke: '#303944' }} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#82909e', fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#111820', border: '1px solid #303944', borderRadius: 7, color: '#e6edf3', fontSize: 10 }} /><Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} fill="#2f81f7" isAnimationActive={false} /></BarChart></ResponsiveContainer></div>;
}
