import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAsset, TICKETABLE_KINDS } from '../src/modules/alerts/rules.js';

const asset = (over = {}) => ({
  id: 'a1',
  assetTag: 'HT-01',
  name: 'Haul Truck HT-01',
  type: 'HAUL_TRUCK',
  site: 'North Pit',
  serviceIntervalHours: 500,
  ...over,
});

const healthyMetrics = {
  days_logged: 30,
  avg_utilization_pct_30d: 72,
  availability_pct_30d: 98,
  unplanned_downtime_hours_30d: 5,
  litres_per_engine_hour: 46, // baseline 45 * 1.25 = 56.25 -> OK
  hours_since_service: 200,
  hours_to_next_service: 300,
};

test('healthy asset raises no findings', () => {
  assert.deepEqual(evaluateAsset(asset(), healthyMetrics), []);
});

test('SERVICE_OVERDUE when hours since service exceeds the interval', () => {
  const found = evaluateAsset(asset(), { ...healthyMetrics, hours_since_service: 575, hours_to_next_service: -75 });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'SERVICE_OVERDUE');
  assert.equal(found[0].observedValue, 575);
  assert.equal(found[0].thresholdValue, 500);
});

test('SERVICE_DUE inside the warning window, but not when also overdue', () => {
  const due = evaluateAsset(asset(), { ...healthyMetrics, hours_since_service: 470, hours_to_next_service: 30 });
  assert.equal(due[0].kind, 'SERVICE_DUE');

  const overdue = evaluateAsset(asset(), { ...healthyMetrics, hours_since_service: 560, hours_to_next_service: -60 });
  assert.equal(overdue[0].kind, 'SERVICE_OVERDUE');
  assert.equal(overdue.filter((f) => f.kind === 'SERVICE_DUE').length, 0);
});

test('LOW_UTILIZATION only with enough logged days', () => {
  const low = evaluateAsset(asset(), { ...healthyMetrics, avg_utilization_pct_30d: 29.5 });
  assert.equal(low.some((f) => f.kind === 'LOW_UTILIZATION'), true);

  const notEnoughData = evaluateAsset(asset(), { ...healthyMetrics, avg_utilization_pct_30d: 29.5, days_logged: 3 });
  assert.equal(notEnoughData.some((f) => f.kind === 'LOW_UTILIZATION'), false);
});

test('EXCESSIVE_DOWNTIME on hours OR on availability', () => {
  const byHours = evaluateAsset(asset(), { ...healthyMetrics, unplanned_downtime_hours_30d: 79.4 });
  assert.equal(byHours[0].kind, 'EXCESSIVE_DOWNTIME');

  const byAvailability = evaluateAsset(asset(), { ...healthyMetrics, availability_pct_30d: 74 });
  assert.equal(byAvailability[0].kind, 'EXCESSIVE_DOWNTIME');
});

test('HIGH_FUEL_BURN compares against the per-type baseline', () => {
  const water = evaluateAsset(asset({ type: 'WATER_TRUCK' }), { ...healthyMetrics, litres_per_engine_hour: 32.31 });
  assert.equal(water[0].kind, 'HIGH_FUEL_BURN');
  assert.equal(water[0].thresholdValue, 27.5); // 22 * 1.25

  // 32.31 L/h is fine for a haul truck (limit 56.25)
  const haul = evaluateAsset(asset({ type: 'HAUL_TRUCK' }), { ...healthyMetrics, litres_per_engine_hour: 32.31 });
  assert.equal(haul.some((f) => f.kind === 'HIGH_FUEL_BURN'), false);
});

test('string-typed metric values (from raw SQL) are coerced', () => {
  const found = evaluateAsset(asset(), { ...healthyMetrics, hours_since_service: '575', hours_to_next_service: '-75' });
  assert.equal(found[0].kind, 'SERVICE_OVERDUE');
});

test('ticketable kinds are the escalating ones', () => {
  assert.deepEqual([...TICKETABLE_KINDS].sort(), ['EXCESSIVE_DOWNTIME', 'HIGH_FUEL_BURN', 'SERVICE_OVERDUE']);
});
