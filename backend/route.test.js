import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
process.env.JWT_SECRET = 'test-secret';
const { default: app } = await import('./server.js');
const token = jwt.sign({id: 1}, process.env.JWT_SECRET);
test('authentication and producer mapping', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response(JSON.stringify([{patient_id: 3, name: 'Test', phone_number: '123'}])); };
  const denied = await request(app).get('/api/approved-patients');
  assert.equal(denied.status, 401); assert.equal(called, false);
  const ok = await request(app).get('/api/approved-patients').set('Authorization', `Bearer ${token}`);
  assert.equal(ok.status, 200); assert.deepEqual(ok.body, [{patient_id: 3, name: 'Test', phone_number: '123'}]); assert.equal(ok.headers['cache-control'], 'no-store');
  globalThis.fetch = async () => { throw new Error('network'); };
  const failed = await request(app).get('/api/approved-patients').set('Authorization', `Bearer ${token}`);
  assert.equal(failed.status, 502);
  const health = await request(app).get('/api/health'); assert.equal(health.status, 200);
});
