const BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') ?? '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.details = body.details;
    throw err;
  }
  return body;
}

export const api = {
  fleetKpis: () => request('/api/analytics/fleet-kpis'),
  assetMetrics: () => request('/api/analytics/assets'),
  assets: () => request('/api/assets'),
  asset: (id) => request(`/api/assets/${id}`),
  utilization: (id, days = 90) => request(`/api/telemetry/${id}/utilization?days=${days}`),
  fuel: (id, days = 90) => request(`/api/telemetry/${id}/fuel?days=${days}`),
  downtime: (id, days = 90) => request(`/api/telemetry/${id}/downtime?days=${days}`),
  flags: (params = {}) => request(`/api/alerts/flags?${new URLSearchParams(params)}`),
  evaluate: () => request('/api/alerts/evaluate', { method: 'POST', body: '{}' }),
  resolveFlag: (id) => request(`/api/alerts/flags/${id}/resolve`, { method: 'POST', body: '{}' }),
  integrationConfig: () => request('/api/integration/config'),
  integrationEvents: (limit = 50) => request(`/api/integration/events?limit=${limit}`),
  testAlert: (payload = {}) =>
    request('/api/integration/test-alert', { method: 'POST', body: JSON.stringify(payload) }),
};
