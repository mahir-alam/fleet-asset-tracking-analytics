import { env, integrationEndpoint } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/**
 * Client for the IT Help Desk Ticketing system's external integration endpoint.
 *
 *   POST {TICKET_TRACKER_BASE_URL}/api/tickets/auto-create
 *   header: X-Api-Key: <INTEGRATION_API_KEY>
 *
 * Payload contract verified against the live source
 * (github.com/mahir-alam/it-helpdesk-ticketing-system,
 *  server/src/modules/tickets/tickets.validation.js#autoCreateTicketSchema):
 *
 *   title          string  3..200      required
 *   description    string  1..5000     required
 *   category       string  1..80       optional (server default "System / Monitoring")
 *   impact         enum    SINGLE_USER | DEPARTMENT | ENTIRE_COMPANY   optional
 *   urgency        enum    WORKAROUND_AVAILABLE | WORK_DEGRADED | SYSTEM_DOWN   optional
 *   externalSource string  1..120      required
 *   externalRef    string  ..200       optional
 *   assetTag       string  ..120       optional
 *
 * There is NO `priority` field — the tracker derives it from impact × urgency.
 * A 201 response body is the full ticket, including `number` (e.g. INC-000123)
 * and `source: "SYSTEM_GENERATED"`.
 */

const KIND_LABEL = {
  SERVICE_DUE: 'Service due',
  SERVICE_OVERDUE: 'Service overdue',
  LOW_UTILIZATION: 'Low utilization',
  HIGH_FUEL_BURN: 'High fuel burn',
  EXCESSIVE_DOWNTIME: 'Excessive unplanned downtime',
};

const KIND_IMPACT = {
  SERVICE_OVERDUE: 'DEPARTMENT',
  EXCESSIVE_DOWNTIME: 'DEPARTMENT',
  HIGH_FUEL_BURN: 'SINGLE_USER',
  SERVICE_DUE: 'SINGLE_USER',
  LOW_UTILIZATION: 'SINGLE_USER',
};

const KIND_URGENCY = {
  SERVICE_OVERDUE: 'WORK_DEGRADED',
  EXCESSIVE_DOWNTIME: 'WORK_DEGRADED',
  HIGH_FUEL_BURN: 'WORKAROUND_AVAILABLE',
  SERVICE_DUE: 'WORKAROUND_AVAILABLE',
  LOW_UTILIZATION: 'WORKAROUND_AVAILABLE',
};

const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);

export function buildAutoCreatePayload({ flag, asset, externalRef }) {
  const label = KIND_LABEL[flag.kind] ?? flag.kind;
  const description = [
    `Automated fleet maintenance alert raised by ${env.integration.externalSource}.`,
    '',
    `Asset:      ${asset.assetTag} — ${asset.name} (${asset.type})`,
    `Site:       ${asset.site}`,
    `Condition:  ${label}`,
    `Detail:     ${flag.detail}`,
    `Observed:   ${flag.observedValue}`,
    `Threshold:  ${flag.thresholdValue}`,
    '',
    `Dashboard:  ${env.dashboardBaseUrl}/assets/${asset.id}`,
    `Flag ID:    ${flag.id}`,
  ].join('\n');

  return {
    title: clip(`${asset.assetTag} — ${label}`, 200),
    description: clip(description, 5000),
    category: 'Fleet / Equipment',
    impact: KIND_IMPACT[flag.kind] ?? 'DEPARTMENT',
    urgency: KIND_URGENCY[flag.kind] ?? 'WORK_DEGRADED',
    externalSource: clip(env.integration.externalSource, 120),
    externalRef: clip(externalRef ?? `flag:${flag.id}`, 200),
    assetTag: clip(asset.assetTag, 120),
  };
}

/**
 * Attempt to create a ticket for a flag.
 * @returns {Promise<{ok:boolean, endpoint:string, requestPayload:object,
 *   status?:number, raw?:object, ticketNumber?:string, ticketId?:string, error?:string}>}
 */
export async function createTicketFromFlag({
  flag,
  asset,
  externalRef,
  fetchImpl = fetch,
  mode = env.integration.mode,
  baseUrl = env.integration.baseUrl,
  apiKey = env.integration.apiKey,
  timeoutMs = env.integration.timeoutMs,
  attempts = env.integration.attempts,
  retryDelayMs = env.integration.retryDelayMs,
}) {
  const endpoint = baseUrl ? `${baseUrl.replace(/\/+$/, '')}${env.integration.endpointPath}` : integrationEndpoint();
  const requestPayload = buildAutoCreatePayload({ flag, asset, externalRef });
  const base = { endpoint, requestPayload };

  if (mode === 'disabled') {
    return { ...base, ok: false, error: 'integration disabled (INTEGRATION_MODE=disabled)' };
  }
  if (mode === 'live' && !baseUrl) {
    return { ...base, ok: false, error: 'INTEGRATION_MODE=live but TICKET_TRACKER_BASE_URL is not set' };
  }
  if (mode === 'mock') {
    const ticketNumber = `INC-${String(Math.floor(Math.random() * 900000) + 100000)}`;
    return {
      ...base,
      ok: true,
      status: 201,
      ticketNumber,
      ticketId: `mock_${flag.id}`,
      raw: { number: ticketNumber, source: 'SYSTEM_GENERATED', mock: true },
    };
  }

  // The tracker is often on a platform that cold-starts (Render free tier), so
  // the first request after an idle period can take tens of seconds or time out.
  // Retry a few times with a short backoff before giving up on a ticket.
  const total = Math.max(1, attempts);
  let lastError;
  for (let attempt = 1; attempt <= total; attempt += 1) {
    const isLast = attempt === total;
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status >= 500 && !isLast) {
          lastError = new Error(`tracker responded ${res.status}`);
          await sleep(retryDelayMs);
          continue;
        }
        return {
          ...base,
          ok: false,
          status: res.status,
          raw,
          error: raw.error || `tracker responded ${res.status}`,
        };
      }

      return {
        ...base,
        ok: true,
        status: res.status,
        raw,
        ticketNumber: raw.number,
        ticketId: raw.id,
      };
    } catch (err) {
      lastError = err;
      if (!isLast) {
        await sleep(retryDelayMs);
        continue;
      }
    }
  }

  logger.error(`auto-create call failed after ${total} attempt(s): ${lastError?.message}`);
  return { ...base, ok: false, error: lastError?.message || 'request failed' };
}
