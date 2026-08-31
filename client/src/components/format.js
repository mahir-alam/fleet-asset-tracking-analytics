export const n1 = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(1));
export const n2 = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(2));
export const int = (v) => (v == null ? '—' : String(Math.round(Number(v))));
export const pct = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
export const money = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);
export const shortDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

export const FLAG_LABEL = {
  SERVICE_DUE: 'Service due',
  SERVICE_OVERDUE: 'Service overdue',
  LOW_UTILIZATION: 'Low utilization',
  HIGH_FUEL_BURN: 'High fuel burn',
  EXCESSIVE_DOWNTIME: 'Excessive downtime',
};

export const flagTone = (kind) =>
  kind === 'SERVICE_OVERDUE' || kind === 'EXCESSIVE_DOWNTIME' ? 'bad' : 'warn';
