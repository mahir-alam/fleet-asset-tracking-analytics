import { n1, n2, int, pct, money } from './format.js';

export default function KpiCards({ kpis }) {
  if (!kpis) return null;
  const cards = [
    { label: 'Active assets', value: int(kpis.active_assets) },
    { label: 'Avg utilization', value: pct(kpis.avg_utilization_pct) },
    { label: 'Avg availability', value: pct(kpis.avg_availability_pct) },
    { label: 'Fuel cost / eng-hr', value: money(kpis.avg_fuel_cost_per_engine_hour) },
    { label: 'Unplanned downtime', value: `${n1(kpis.total_unplanned_downtime_hours)} h`, sub: 'trailing 30 days' },
    { label: 'Overdue for service', value: int(kpis.assets_overdue_service) },
    { label: 'Open flags', value: int(kpis.open_flags) },
    { label: 'Tickets auto-raised', value: int(kpis.tickets_auto_raised) },
  ];
  return (
    <div className="kpi-row">
      {cards.map((c) => (
        <div className="kpi" key={c.label}>
          <div className="label">{c.label}</div>
          <div className="value">{c.value}</div>
          {c.sub && <div className="sub">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}
