import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/setupEnv.js";
import supertest from "supertest";
import { app, pool } from "../server.js";
import { TEST_API_KEY } from "./helpers/testKey.js";

test.after(async () => {
  await pool.end();
});

test("returns 401 with a message when no key is sent", async () => {
  const res = await supertest(app).get("/api/pharmacies");
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: "Missing or invalid API key" });
});

test("returns 401 for a wrong key", async () => {
  const res = await supertest(app).get("/api/pharmacies").set("X-API-Key", "wrong");
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: "Missing or invalid API key" });
});

test("returns 401 for a key that is one character off", async () => {
  const res = await supertest(app)
    .get("/api/pharmacies")
    .set("X-API-Key", TEST_API_KEY.slice(0, -1) + "0");
  assert.equal(res.status, 401);
});

test("returns 401 for an empty key header", async () => {
  const res = await supertest(app).get("/api/pharmacies").set("X-API-Key", "");
  assert.equal(res.status, 401);
});

test("returns 200 for a valid key", async () => {
  const res = await supertest(app).get("/api/pharmacies").set("X-API-Key", TEST_API_KEY);
  assert.equal(res.status, 200);
  assert.equal(Array.isArray(res.body), true);
});

test("accepts the header name in any letter case", async () => {
  const res = await supertest(app).get("/api/pharmacies").set("x-api-key", TEST_API_KEY);
  assert.equal(res.status, 200);
});

test("does not accept the key in the query string", async () => {
  const res = await supertest(app).get(`/api/pharmacies?api_key=${TEST_API_KEY}`);
  assert.equal(res.status, 401);
});

test("does not accept the key as a bearer token", async () => {
  const res = await supertest(app)
    .get("/api/pharmacies")
    .set("Authorization", `Bearer ${TEST_API_KEY}`);
  assert.equal(res.status, 401);
});

test("protects login and register too (401, not 400)", async () => {
  const login = await supertest(app).post("/api/auth/login").send({});
  const register = await supertest(app).post("/api/auth/register").send({});
  assert.equal(login.status, 401);
  assert.equal(register.status, 401);
});

test("protects write endpoints (key checked before login token)", async () => {
  const res = await supertest(app)
    .post("/api/inventory")
    .send({ medicine: "X", quantity: 1, price: 1 });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: "Missing or invalid API key" });
});

test("with a valid key but no login token, inventory writes still say 'Login required'", async () => {
  const res = await supertest(app)
    .post("/api/inventory")
    .set("X-API-Key", TEST_API_KEY)
    .send({ medicine: "X", quantity: 1, price: 1 });
  assert.equal(res.status, 401);
  assert.equal(res.body.message, "Login required");
});

test("answers 401, not 404, for unknown URLs without a key", async () => {
  const res = await supertest(app).get("/api/does-not-exist");
  assert.equal(res.status, 401);
});

test("checks the key before parsing the body (bad JSON without a key is a 401)", async () => {
  const res = await supertest(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send('{"broken": ');
  assert.equal(res.status, 401);
});

test("never echoes the key back in a response", async () => {
  const res = await supertest(app).get("/api/pharmacies").set("X-API-Key", TEST_API_KEY);
  assert.equal(JSON.stringify(res.body).includes(TEST_API_KEY), false);
  assert.equal(JSON.stringify(res.headers).includes(TEST_API_KEY), false);
});

test("keeps /api/health public, with or without a trailing slash", async () => {
  const plain = await supertest(app).get("/api/health");
  const slash = await supertest(app).get("/api/health/");
  assert.equal(plain.status, 200);
  assert.equal(slash.status, 200);
});

test("lets a browser preflight (OPTIONS) through without a key", async () => {
  const res = await supertest(app)
    .options("/api/pharmacies")
    .set("Origin", process.env.CORS_ORIGIN || "http://localhost:5173")
    .set("Access-Control-Request-Method", "GET")
    .set("Access-Control-Request-Headers", "x-api-key");
  assert.equal(res.status, 204);
  assert.equal(String(res.headers["access-control-allow-headers"]).toLowerCase().includes("x-api-key"), true);
});
