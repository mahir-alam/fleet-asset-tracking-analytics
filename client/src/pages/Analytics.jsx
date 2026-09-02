import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { api } from '../api/client.js';
import { n1, n2 } from '../components/format.js';

const axis = { stroke: '#8b9bab', fontSize: 11 };
const grid = '#2b3a4a';

export default function Analytics() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .assetMetrics()
      .then((r) => {
        setRows(r);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const utilData = useMemo(
    () =>
      [...rows]
        .filter((r) => r.avg_utilization_pct_30d != null)
        .sort((a, b) => a.avg_utilization_pct_30d - b.avg_utilization_pct_30d)
        .map((r) => ({ name: r.assetTag, util: r.avg_utilization_pct_30d })),
    [rows],
  );

  const downtimePareto = useMemo(() => {
    const sorted = [...rows]
      .map((r) => ({ name: r.assetTag, hrs: r.unplanned_downtime_hours_30d ?? 0 }))
      .sort((a, b) => b.hrs - a.hrs);
    const total = sorted.reduce((s, r) => s + r.hrs, 0) || 1;
    let cum = 0;
    return sorted.map((r) => {
      cum += r.hrs;
      return { ...r, cumPct: Math.round((cum / total) * 100) };
    });
  }, [rows]);

  const fuelScatter = useMemo(
    () =>
      rows
        .filter((r) => r.litres_per_engine_hour != null)
        .map((r) => ({
          name: r.assetTag,
          x: r.total_engine_hours_30d ?? 0,
          y: r.litres_per_engine_hour,
          z: r.fuel_cost_30d ?? 0,
        })),
    [rows],
  );

  if (loading) return <div className="loading">Loading analytics…</div>;
  if (error) return <div className="loading">Couldn’t load analytics: {error}</div>;

  return (
    <>
      <div className="banner">
        This is the <strong>operational</strong> analytics view. Deeper historical/BI exploration —
        trends, drill-through, executive reporting — lives in the separate{' '}
        <strong>Power BI</strong> report built on the same SQL views (see <span className="mono">powerbi/</span>).
      </div>

      <div className="panel">
        <h2>30-day average utilization by asset</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={utilData}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="name" {...axis} />
            <YAxis {...axis} unit="%" />
            <Tooltip contentStyle={{ background: '#17212b', border: '1px solid #2b3a4a' }} />
            <Bar dataKey="util" name="Utilization %">
              {utilData.map((d) => (
                <Cell key={d.name} fill={d.util < 45 ? '#f85149' : d.util < 60 ? '#d29922' : '#3fb950'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h2>Unplanned downtime — Pareto (30 days)</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={downtimePareto}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="name" {...axis} />
            <YAxis {...axis} unit="h" />
            <Tooltip contentStyle={{ background: '#17212b', border: '1px solid #2b3a4a' }} />
            <Bar dataKey="hrs" name="Downtime h" fill="#3d9df2" />
          </BarChart>
        </ResponsiveContainer>
        <p className="hint">
          Top contributors:{' '}
          {downtimePareto
            .slice(0, 3)
            .map((r) => `${r.name} (${n1(r.hrs)} h)`)
            .join(', ')}
        </p>
      </div>

      <div className="panel">
        <h2>Fuel efficiency vs. usage</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart>
            <CartesianGrid stroke={grid} />
            <XAxis type="number" dataKey="x" name="Engine hrs 30d" {...axis} />
            <YAxis type="number" dataKey="y" name="L / eng-hr" {...axis} />
            <ZAxis type="number" dataKey="z" range={[60, 400]} name="Fuel $ 30d" />
            <Tooltip
              contentStyle={{ background: '#17212b', border: '1px solid #2b3a4a' }}
              formatter={(v, k) => (k === 'L / eng-hr' ? n2(v) : n1(v))}
            />
            <Scatter data={fuelScatter} fill="#3d9df2" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
