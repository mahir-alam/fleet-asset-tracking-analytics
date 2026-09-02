import { config } from 'dotenv';

/**
 * Central environment access. Loads the repo-root .env regardless of the
 * process working directory (npm workspace scripts run from server/), then
 * falls back to local development defaults.
 */
config({ path: new URL('../../../.env', import.meta.url) });

const {
  NODE_ENV = 'development',
  PORT = '4000',
  DATABASE_URL = 'postgresql://fleet:fleet@localhost:5433/fleet?schema=public',
  CLIENT_ORIGIN = 'http://localhost:5173',
  DASHBOARD_BASE_URL = 'http://localhost:5173',
  EVALUATION_CRON = '',
  INTEGRATION_MODE,
  TICKET_TRACKER_BASE_URL = '',
  INTEGRATION_API_KEY = '',
  INTEGRATION_EXTERNAL_SOURCE = 'fleet-asset-tracker',
  INTEGRATION_TIMEOUT_MS = '5000',
} = process.env;

const baseUrl = TICKET_TRACKER_BASE_URL.replace(/\/+$/, '');
// Default to a safe offline mode unless a real tracker URL is configured.
const mode = INTEGRATION_MODE || (baseUrl ? 'live' : 'mock');

export const env = {
  nodeEnv: NODE_ENV,
  isProd: NODE_ENV === 'production',
  port: Number(PORT),
  databaseUrl: DATABASE_URL,
  clientOrigin: CLIENT_ORIGIN,
  dashboardBaseUrl: DASHBOARD_BASE_URL.replace(/\/+$/, ''),
  evaluationCron: EVALUATION_CRON.trim(),
  integration: {
    mode, // 'live' | 'mock' | 'disabled'
    baseUrl,
    apiKey: INTEGRATION_API_KEY,
    externalSource: INTEGRATION_EXTERNAL_SOURCE,
    timeoutMs: Number(INTEGRATION_TIMEOUT_MS),
    endpointPath: '/api/tickets/auto-create',
  },
};

export function integrationEndpoint() {
  return `${env.integration.baseUrl}${env.integration.endpointPath}`;
}
