import test from 'node:test';
import assert from 'node:assert/strict';
import { runFleetEvaluation } from '../src/modules/alerts/alerts.service.js';

function fakeDeps({ assets, metrics }) {
  const flags = [];
  const integrationEvents = [];
  let seq = 0;
  return {
    store: { flags, integrationEvents },
    deps: {
      getAssets: async () => assets,
      getMetrics: async () => metrics,
      findActiveFlag: async (assetId, kind) =>
        flags.find((f) => f.assetId === assetId && f.kind === kind && f.status !== 'RESOLVED') ?? null,
      createFlag: async (data) => {
        const existing = flags.find(
          (f) => f.assetId === data.assetId && f.kind === data.kind && f.status !== 'RESOLVED',
        );
        if (existing) {
          const err = new Error('unique');
          err.code = 'P2002';
          throw err;
        }
        const flag = { id: `flag_${(seq += 1)}`, status: 'OPEN', externalTicketNumber: null, ...data };
        flags.push(flag);
        return flag;
      },
      recordIntegrationEvent: async (data) => {
        integrationEvents.push(data);
        return data;
      },
      markTicketed: async (id, data) => {
        const flag = flags.find((f) => f.id === id);
        Object.assign(flag, data);
        return flag;
      },
      ticketClient: async ({ flag }) => ({
        ok: true,
        endpoint: 'http://tracker/api/tickets/auto-create',
        requestPayload: { title: flag.kind },
        status: 201,
        ticketNumber: `INC-00${flag.id}`,
        ticketId: `t_${flag.id}`,
        raw: { source: 'SYSTEM_GENERATED' },
      }),
    },
  };
}

const ASSETS = [
  { id: 'a_over', assetTag: 'HT-13', type: 'HAUL_TRUCK', name: 'HT-13', site: 'ROM', serviceIntervalHours: 500 },
  { id: 'a_low', assetTag: 'DZ-02', type: 'DOZER', name: 'DZ-02', site: 'North', serviceIntervalHours: 500 },
  { id: 'a_ok', assetTag: 'LD-01', type: 'LOADER', name: 'LD-01', site: 'South', serviceIntervalHours: 500 },
];
const METRICS = [
  { assetId: 'a_over', days_logged: 30, hours_since_service: 575, hours_to_next_service: -75, avg_utilization_pct_30d: 70, availability_pct_30d: 98, unplanned_downtime_hours_30d: 3, litres_per_engine_hour: 40 },
  { assetId: 'a_low', days_logged: 30, hours_since_service: 100, hours_to_next_service: 400, avg_utilization_pct_30d: 29, availability_pct_30d: 99, unplanned_downtime_hours_30d: 2, litres_per_engine_hour: 20 },
  { assetId: 'a_ok', days_logged: 30, hours_since_service: 100, hours_to_next_service: 400, avg_utilization_pct_30d: 80, availability_pct_30d: 99, unplanned_downtime_hours_30d: 2, litres_per_engine_hour: 20 },
];

test('raises flags, tickets only the ticketable kinds, records an event per call', async () => {
  const { store, deps } = fakeDeps({ assets: ASSETS, metrics: METRICS });
  const summary = await runFleetEvaluation({ deps });

  assert.equal(summary.evaluated, 3);
  assert.equal(summary.newFlags, 2); // SERVICE_OVERDUE + LOW_UTILIZATION
  assert.equal(summary.ticketsCreated, 1); // only SERVICE_OVERDUE is ticketable
  assert.equal(store.integrationEvents.length, 1);

  const overdue = store.flags.find((f) => f.kind === 'SERVICE_OVERDUE');
  assert.equal(overdue.status, 'TICKETED');
  assert.match(overdue.externalTicketNumber, /^INC-/);

  const low = store.flags.find((f) => f.kind === 'LOW_UTILIZATION');
  assert.equal(low.status, 'OPEN');
});

test('is idempotent — a second run creates nothing new (dedupe)', async () => {
  const { store, deps } = fakeDeps({ assets: ASSETS, metrics: METRICS });
  await runFleetEvaluation({ deps });
  const second = await runFleetEvaluation({ deps });

  assert.equal(second.newFlags, 0);
  assert.equal(second.ticketsCreated, 0);
  assert.equal(store.flags.length, 2);
  assert.equal(store.integrationEvents.length, 1);
});

test('createTickets:false raises flags but makes no calls', async () => {
  const { store, deps } = fakeDeps({ assets: ASSETS, metrics: METRICS });
  const summary = await runFleetEvaluation({ createTickets: false, deps });
  assert.equal(summary.newFlags, 2);
  assert.equal(summary.ticketsCreated, 0);
  assert.equal(store.integrationEvents.length, 0);
});
