import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

test('GET /health reports the service and integration mode', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.service, 'fleet-api');
  assert.ok(['live', 'mock', 'disabled'].includes(res.body.mode));
});

test('unknown routes return a JSON 404', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Route not found');
});

test('GET /api/integration/config exposes the integration wiring', async () => {
  const res = await request(app).get('/api/integration/config');
  assert.equal(res.status, 200);
  assert.ok('mode' in res.body);
  assert.ok('configured' in res.body);
  assert.equal(res.body.externalSource, 'fleet-asset-tracker');
});

test('validation rejects a bad query param with 400 + details', async () => {
  const res = await request(app).get('/api/alerts/flags?status=BOGUS');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
  assert.ok(Array.isArray(res.body.details));
});
