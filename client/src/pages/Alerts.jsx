import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import FlagBadge from '../components/FlagBadge.jsx';
import { n1, shortDate } from '../components/format.js';

export default function Alerts() {
  const [flags, setFlags] = useState([]);
  const [events, setEvents] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    const [f, e] = await Promise.all([
      api.flags(statusFilter ? { status: statusFilter } : {}),
      api.integrationEvents(100),
    ]);
    setFlags(f);
    setEvents(e);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  async function resolve(id) {
    await api.resolveFlag(id);
    await load();
  }

  if (loading) return <div className="loading">Loading alerts…</div>;

  return (
    <>
      <div className="panel">
        <h2>Maintenance flags</h2>
        <div className="toolbar">
          {['', 'OPEN', 'TICKETED', 'RESOLVED'].map((s) => (
            <button
              key={s || 'ALL'}
              className={`btn ${statusFilter === s ? 'primary' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Kind</th>
              <th>Detail</th>
              <th>Obs / Thr</th>
              <th>Status</th>
              <th>Ticket</th>
              <th>Raised</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.id}>
                <td>
                  <Link to={`/assets/${f.assetId}`}>{f.asset?.assetTag ?? f.assetId}</Link>
                </td>
                <td>
                  <FlagBadge kind={f.kind} />
                </td>
                <td>{f.detail}</td>
                <td>
                  {n1(f.observedValue)} / {n1(f.thresholdValue)}
                </td>
                <td>
                  <span
                    className={`pill ${
                      f.status === 'TICKETED' ? 'ok' : f.status === 'RESOLVED' ? 'muted' : 'warn'
                    }`}
                  >
                    {f.status}
                  </span>
                </td>
                <td className="mono">{f.externalTicketNumber ?? '—'}</td>
                <td>{shortDate(f.createdAt)}</td>
                <td>
                  {f.status !== 'RESOLVED' && (
                    <button className="btn" onClick={() => resolve(f.id)}>
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {flags.length === 0 && (
              <tr>
                <td colSpan={8} className="hint">
                  No flags. Run “Refresh evaluation” on the dashboard.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Integration event log</h2>
        <p className="hint">
          Every outbound call to <span className="mono">POST /api/tickets/auto-create</span>. This is the
          record you cross-check against the IT ticketing system.
        </p>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Endpoint</th>
              <th>Result</th>
              <th>Ticket</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.createdAt).toISOString().slice(0, 19).replace('T', ' ')}</td>
                <td className="mono">{e.endpoint}</td>
                <td>
                  <span className={`pill ${e.ok ? 'ok' : 'bad'}`}>
                    {e.ok ? `${e.responseStatus ?? 'OK'}` : e.errorMessage || 'failed'}
                  </span>
                </td>
                <td className="mono">{e.ticketNumber ?? '—'}</td>
                <td>
                  <button
                    className="btn"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    {expanded === e.id ? 'Hide' : 'View'}
                  </button>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
                  No integration calls yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {expanded && (
          <pre className="payload">
            {JSON.stringify(events.find((e) => e.id === expanded)?.requestPayload, null, 2)}
          </pre>
        )}
      </div>
    </>
  );
}
