// === filename: frontend/src/components/charts/LogTypeDonutChart.jsx ===
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const colors = ['#39d5ff', '#bc8cff', '#d29922', '#f85149', '#3fb950', '#2f81f7', '#8b949e'];

/** Donut chart showing the normalized event type distribution. */
export default function LogTypeDonutChart({ data = [] }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return <div className="donut-layout"><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="61%" outerRadius="83%" paddingAngle={2} stroke="#161b22" strokeWidth={3} isAnimationActive={false}>{data.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip contentStyle={{ background: '#111820', border: '1px solid #303944', borderRadius: 7, color: '#e6edf3', fontSize: 10 }} /></PieChart></ResponsiveContainer><div className="donut-center"><strong className="mono">{total.toLocaleString()}</strong><span>events</span></div></div><div className="donut-legend" aria-label="Log type legend">{data.map((item, index) => <div key={item.name}><i style={{ background: colors[index % colors.length] }} /> <span>{item.name}</span><b className="mono">{item.value}</b></div>)}</div></div>;
}
