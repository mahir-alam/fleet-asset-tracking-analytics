import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildAutoCreatePayload, createTicketFromFlag } from '../src/modules/integration/ticketClient.js';

/**
 * Local copy of the IT Ticket Tracker's autoCreateTicketSchema
 * (server/src/modules/tickets/tickets.validation.js on `main`).
 * If our payload ever stops satisfying this, the contract has drifted.
 */
const impact = z.enum(['SINGLE_USER', 'DEPARTMENT', 'ENTIRE_COMPANY']);
const urgency = z.enum(['WORKAROUND_AVAILABLE', 'WORK_DEGRADED', 'SYSTEM_DOWN']);
const autoCreateTicketSchema = z
  .object({
    title: z.string().min(3).max(200).trim(),
    description: z.string().min(1).max(5000).trim(),
    category: z.string().min(1).max(80).trim().default('System / Monitoring'),
    impact: impact.default('DEPARTMENT'),
    urgency: urgency.default('WORK_DEGRADED'),
    externalSource: z.string().min(1).max(120).trim(),
    externalRef: z.string().max(200).trim().optional(),
    assetTag: z.string().max(120).trim().optional(),
  })
  .strict(); // reject unknown keys — our payload must contain ONLY contract fields

const flag = {
  id: 'flag_123',
  kind: 'SERVICE_OVERDUE',
  detail: '575 engine-hours since last service; interval is 500 h (over by 75 h).',
  thresholdValue: 500,
  observedValue: 575,
};
const asset = {
  id: 'asset_1',
  assetTag: 'HT-13',
  name: 'Haul Truck HT-13',
  type: 'HAUL_TRUCK',
  site: 'Main ROM Pad',
};

test('payload satisfies the tracker contract and carries no extra keys', () => {
  const payload = buildAutoCreatePayload({ flag, asset });
  const parsed = autoCreateTicketSchema.parse(payload);
  assert.equal(parsed.externalSource, 'fleet-asset-tracker');
  assert.equal(parsed.externalRef, 'flag:flag_123');
  assert.equal(parsed.assetTag, 'HT-13');
  assert.ok(!('priority' in payload), 'must not send a priority field');
});

test('impact/urgency vary by flag kind but stay in-enum', () => {
  for (const kind of ['SERVICE_OVERDUE', 'EXCESSIVE_DOWNTIME', 'HIGH_FUEL_BURN', 'LOW_UTILIZATION', 'SERVICE_DUE']) {
    const p = buildAutoCreatePayload({ flag: { ...flag, kind }, asset });
    assert.doesNotThrow(() => autoCreateTicketSchema.parse(p), `kind ${kind}`);
  }
});

test('mock mode returns a synthetic INC- number without touching the network', async () => {
  let called = false;
  const res = await createTicketFromFlag({
    flag,
    asset,
    mode: 'mock',
    fetchImpl: () => {
      called = true;
      throw new Error('should not be called');
    },
  });
  assert.equal(called, false);
  assert.equal(res.ok, true);
  assert.match(res.ticketNumber, /^INC-\d{6}$/);
  assert.equal(res.raw.source, 'SYSTEM_GENERATED');
});

test('live mode sends X-Api-Key and parses the ticket number from a 201', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 201,
      json: async () => ({ id: 'tkt_1', number: 'INC-000777', source: 'SYSTEM_GENERATED' }),
    };
  };
  const res = await createTicketFromFlag({
    flag,
    asset,
    mode: 'live',
    baseUrl: 'https://tracker.example.com',
    apiKey: 'test-key',
    fetchImpl,
  });
  assert.equal(res.ok, true);
  assert.equal(res.ticketNumber, 'INC-000777');
  assert.equal(calls[0].opts.headers['x-api-key'], 'test-key');
  assert.equal(res.ticketId, 'tkt_1');
  assert.match(calls[0].url, /\/api\/tickets\/auto-create$/);
  assert.equal(calls[0].opts.method, 'POST');
  assert.ok('x-api-key' in calls[0].opts.headers);
  const sent = JSON.parse(calls[0].opts.body);
  assert.doesNotThrow(() => autoCreateTicketSchema.parse(sent));
});

test('live mode retries on a 5xx then surfaces the failure', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return { ok: false, status: 503, json: async () => ({ error: 'unavailable' }) };
  };
  const res = await createTicketFromFlag({
    flag,
    asset,
    mode: 'live',
    baseUrl: 'https://tracker.example.com',
    fetchImpl,
    attempts: 3,
    retryDelayMs: 0,
  });
  assert.equal(n, 3, 'should exhaust all attempts');
  assert.equal(res.ok, false);
  assert.equal(res.status, 503);
});

test('live mode retries a network error and succeeds on a later attempt', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n < 3) throw new Error('ECONNREFUSED');
    return {
      ok: true,
      status: 201,
      json: async () => ({ id: 'tkt_9', number: 'INC-000901', source: 'SYSTEM_GENERATED' }),
    };
  };
  const res = await createTicketFromFlag({
    flag,
    asset,
    mode: 'live',
    baseUrl: 'https://tracker.example.com',
    fetchImpl,
    attempts: 3,
    retryDelayMs: 0,
  });
  assert.equal(n, 3);
  assert.equal(res.ok, true);
  assert.equal(res.ticketNumber, 'INC-000901');
});
