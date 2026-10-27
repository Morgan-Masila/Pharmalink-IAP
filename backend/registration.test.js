import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
process.env.JWT_SECRET = 'test-secret';
const { default: app, pool } = await import('./server.js');
test('registration supplies a usable token and handles duplicate races', async () => {
  const original = pool.query;
  const originalFetch = globalThis.fetch;
  try {
    pool.query = async (sql) => sql.includes('SELECT id') ? [[]] : [{ insertId: 42 }];
    globalThis.fetch = async () => new Response('[]');
    const created = await request(app).post('/api/auth/register').send({ name:'Test Pharmacy', area:'Nairobi CBD', password:'password123' });
    assert.equal(created.status, 201);
    assert.equal(jwt.verify(created.body.token, process.env.JWT_SECRET).id, 42);
    const patients = await request(app).get('/api/approved-patients').set('Authorization', `Bearer ${created.body.token}`);
    assert.equal(patients.status, 200);
    pool.query = async (sql) => { if (sql.includes('SELECT id')) return [[]]; const e = new Error('duplicate'); e.code='ER_DUP_ENTRY'; throw e; };
    const duplicate = await request(app).post('/api/auth/register').send({ name:'Test Pharmacy', area:'Nairobi CBD', password:'password123' });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.message, /log in/i);
  } finally { pool.query = original; globalThis.fetch = originalFetch; await pool.end(); }
});
