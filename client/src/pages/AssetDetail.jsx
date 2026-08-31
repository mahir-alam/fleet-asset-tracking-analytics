import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client.js';
import FlagBadge from '../components/FlagBadge.jsx';
import { money, n1, n2, pct, shortDate } from '../components/format.js';

const axis = { stroke: '#8b9bab', fontSize: 11 };
const grid = '#2b3a4a';

export default function AssetDetail() {
  const { id } = useParams();
  const [asset, setAsset] = useState(null);
  const [util, setUtil] = useState([]);
  const [fuel, setFuel] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([api.asset(id), api.utilization(id, 90), api.fuel(id, 90)])
      .then(([a, u, f]) => {
        setAsset(a);
        setUtil(u.map((r) => ({ ...r, date: shortDate(r.date) })));
        setFuel(f.map((r) => ({ ...r, date: shortDate(r.date) })));
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="loading">Error: {err}</div>;
  if (!asset) return <div className="loading">Loading asset…</div>;

  const m = asset.metrics ?? {};
  const activeFlags = asset.maintenanceFlags.filter((f) => f.status !== 'RESOLVED');

  return (
    <>
      <p>
        <Link to="/">← Fleet</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>
        {asset.assetTag} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{asset.name}</span>
      </h1>
      <p className="sub" style={{ color: 'var(--muted)' }}>
        {asset.type} · {asset.model} · {asset.site} · commissioned {shortDate(asset.commissionedAt)}
      </p>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Utilization 30d</div>
          <div className="value">{pct(m.avg_utilization_pct_30d)}</div>
        </div>
        <div className="kpi">
          <div className="label">Availability 30d</div>
          <div className="value">{pct(m.availability_pct_30d)}</div>
        </div>
        <div className="kpi">
          <div className="label">MTBF / MTTR</div>
          <div className="value">
            {n1(m.mtbf_hours)} / {n1(m.mttr_hours)} h
          </div>
        </div>
        <div className="kpi">
          <div className="label">Fuel L/eng-hr</div>
          <div className="value">{n2(m.litres_per_engine_hour)}</div>
          <div className="sub">{money(m.cost_per_engine_hour)}/eng-hr</div>
        </div>
        <div className="kpi">
          <div className="label">Hrs since service</div>
          <div className="value">{n1(m.hours_since_service)}</div>
          <div className="sub">interval {asset.serviceIntervalHours} h</div>
        </div>
        <div className="kpi">
          <div className="label">Hrs to next service</div>
          <div className="value">
            {m.service_overdue ? <span className="pill bad">OVERDUE</span> : n1(m.hours_to_next_service)}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Open maintenance flags</h2>
        {activeFlags.length === 0 ? (
          <p className="hint">No active flags.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Detail</th>
                <th>Observed</th>
                <th>Threshold</th>
                <th>Status</th>
                <th>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {activeFlags.map((f) => (
                <tr key={f.id}>
                  <td>
                    <FlagBadge kind={f.kind} />
                  </td>
                  <td>{f.detail}</td>
                  <td>{n1(f.observedValue)}</td>
                  <td>{n1(f.thresholdValue)}</td>
                  <td>
                    <span className={`pill ${f.status === 'TICKETED' ? 'ok' : 'warn'}`}>{f.status}</span>
                  </td>
                  <td className="mono">{f.externalTicketNumber ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Daily utilization (90 days)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={util}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="date" {...axis} minTickGap={40} />
              <YAxis {...axis} unit="%" />
              <Tooltip contentStyle={{ background: '#17212b', border: '1px solid #2b3a4a' }} />
              <Area dataKey="utilization_pct" stroke="#3d9df2" fill="#3d9df233" name="Utilization %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2>Engine hours / day</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={util}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="date" {...axis} minTickGap={40} />
              <YAxis {...axis} />
              <Tooltip contentStyle={{ background: '#17212b', border: '1px solid #2b3a4a' }} />
              <Line dataKey="engineHours" stroke="#3fb950" dot={false} name="Engine hrs" />
              <Line dataKey="idleHours" stroke="#d29922" dot={false} name="Idle hrs" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2>Fuel fills (litres)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={fuel}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="date" {...axis} minTickGap={40} />
              <YAxis {...axis} />
              <Tooltip contentStyle={{ background: '#17212b', border: '1px solid #2b3a4a' }} />
              <Bar dataKey="litres" fill="#3d9df2" name="Litres" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2>Recent downtime</h2>
          {asset.downtimeEvents.length === 0 ? (
            <p className="hint">No downtime recorded.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Start</th>
                  <th>Hrs</th>
                  <th>Category</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {asset.downtimeEvents.slice(0, 12).map((d) => (
                  <tr key={d.id}>
                    <td>{new Date(d.startAt).toISOString().slice(0, 16).replace('T', ' ')}</td>
                    <td>{n1(d.hours)}</td>
                    <td>
                      <span className={`pill ${d.category === 'UNPLANNED' ? 'bad' : 'muted'}`}>
                        {d.category}
                      </span>
                    </td>
                    <td>{d.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
