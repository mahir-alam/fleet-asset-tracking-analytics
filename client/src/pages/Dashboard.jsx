import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import KpiCards from '../components/KpiCards.jsx';
import FlagBadge from '../components/FlagBadge.jsx';
import { n1, n2, pct } from '../components/format.js';

function utilTone(v) {
  if (v == null) return 'muted';
  if (v < 45) return 'bad';
  if (v < 60) return 'warn';
  return 'ok';
}

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [assets, setAssets] = useState([]);
  const [flagsByAsset, setFlagsByAsset] = useState({});
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const [testAssetId, setTestAssetId] = useState('');

  const load = useCallback(async () => {
    const [k, a, c, f] = await Promise.all([
      api.fleetKpis(),
      api.assetMetrics(),
      api.integrationConfig(),
      api.flags(),
    ]);
    setKpis(k);
    setAssets(a);
    setConfig(c);
    const grouped = {};
    for (const flag of f) {
      if (flag.status === 'RESOLVED') continue;
      (grouped[flag.assetId] ??= []).push(flag);
    }
    setFlagsByAsset(grouped);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, [load]);

  const flash = (t) => {
    setToast(t);
    setTimeout(() => setToast(null), 6000);
  };

  async function runEvaluation() {
    setBusy(true);
    try {
      const s = await api.evaluate();
      flash({
        msg: `Evaluation: ${s.newFlags} new flag(s), ${s.ticketsCreated} ticket(s) created${
          s.ticketFailures ? `, ${s.ticketFailures} failed` : ''
        }.`,
      });
      await load();
    } catch (e) {
      flash({ bad: true, msg: `Evaluation failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function sendTestAlert() {
    setBusy(true);
    try {
      const r = await api.testAlert({
        kind: 'EXCESSIVE_DOWNTIME',
        ...(testAssetId ? { assetId: testAssetId } : {}),
      });
      flash({
        bad: !r.ok,
        msg: r.ok
          ? `Simulated alert for ${r.asset.assetTag}: mock ticket ${r.ticketNumber} — no real ticket was created. See the integration event log.`
          : `Test alert failed: ${r.error}`,
      });
      await load();
    } catch (e) {
      flash({ bad: true, msg: `Test alert failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="loading">Loading fleet…</div>;
  if (error) return <div className="loading">Couldn’t load the fleet dashboard: {error}</div>;

  return (
    <>
      {config && (
        <div className={`banner ${config.mode}`}>
          Ticketing integration: <strong>{config.mode}</strong>
          {config.configured
            ? ` → ${config.endpoint}`
            : ' — no TICKET_TRACKER_BASE_URL set; calls are simulated and still logged.'}
        </div>
      )}

      <KpiCards kpis={kpis} />

      <div className="toolbar">
        <button className="btn primary" onClick={runEvaluation} disabled={busy}>
          {busy ? 'Working…' : 'Refresh evaluation'}
        </button>
        <select
          className="btn"
          value={testAssetId}
          onChange={(e) => setTestAssetId(e.target.value)}
          disabled={busy}
          aria-label="Asset for test alert"
        >
          <option value="">First asset ({assets[0]?.assetTag ?? '—'})</option>
          {assets.map((a) => (
            <option key={a.assetId} value={a.assetId}>
              {a.assetTag}
            </option>
          ))}
        </select>
        <button className="btn" onClick={sendTestAlert} disabled={busy}>
          Send test alert
        </button>
        <span className="sub" style={{ color: 'var(--muted)' }}>
          Evaluation scans every asset and auto-creates IT tickets for ticketable breaches. A test
          alert is always a simulation — it never posts to a real ticketing system.
        </span>
      </div>

      <div className="panel">
        <h2>Fleet ({assets.length})</h2>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Type</th>
                <th>Util % (30d)</th>
                <th>Avail % (30d)</th>
                <th>Unplan. downtime</th>
                <th>Fuel L/eng-hr</th>
                <th>Hrs to service</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.assetId}>
                  <td>
                    <Link to={`/assets/${a.assetId}`}>{a.assetTag}</Link>
                  </td>
                  <td className="sub" style={{ color: 'var(--muted)' }}>
                    {a.type}
                  </td>
                  <td>
                    <span className={`pill ${utilTone(a.avg_utilization_pct_30d)}`}>
                      {pct(a.avg_utilization_pct_30d)}
                    </span>
                  </td>
                  <td>{pct(a.availability_pct_30d)}</td>
                  <td>{n1(a.unplanned_downtime_hours_30d)} h</td>
                  <td>{n2(a.litres_per_engine_hour)}</td>
                  <td className={a.service_overdue ? 'pill bad' : undefined}>
                    {a.service_overdue ? 'OVERDUE' : n1(a.hours_to_next_service)}
                  </td>
                  <td>
                    {(flagsByAsset[a.assetId] ?? []).length === 0 ? (
                      <span className="pill muted">none</span>
                    ) : (
                      (flagsByAsset[a.assetId] ?? []).map((f) => (
                        <span key={f.id}>
                          <FlagBadge kind={f.kind} />
                          {f.externalTicketNumber && (
                            <span className="pill ok flag-badge mono">{f.externalTicketNumber}</span>
                          )}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Flag detail and linked tickets are on each asset page and the Alerts &amp; Tickets tab.
        </p>
      </div>

      {toast && <div className={`toast ${toast.bad ? 'bad' : ''}`}>{toast.msg}</div>}
    </>
  );
}
