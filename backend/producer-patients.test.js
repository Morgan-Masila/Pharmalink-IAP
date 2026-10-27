import test from "node:test";
import assert from "node:assert/strict";
import { getApprovedPatients } from "./producer-patients.js";

const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
test("requests approved patients and maps only contract fields", async () => {
  const result = await getApprovedPatients({ url: "https://example.test/api/patients?match_status=PENDING", fetchImpl: async (url) => {
    assert.equal(url.searchParams.get("match_status"), "APPROVED");
    return response([{ patient_id: 3, name: "Test", phone_number: null, extra: "ignored" }]);
  }});
  assert.deepEqual(result, [{ patient_id: 3, name: "Test", phone_number: null }]);
});
test("recognizes producer empty result only", async () => {
  assert.deepEqual(await getApprovedPatients({ fetchImpl: async () => response({ message: "There are currently no patients with the requested match status" }, 404) }), []);
  await assert.rejects(getApprovedPatients({ fetchImpl: async () => response({ message: "Not found" }, 404) }), { status: 502 });
});
test("rejects upstream errors and invalid payloads", async () => {
  for (const value of [response({}, 500), response({}), response([{ patient_id: 1, name: "Test" }]), new Response("not json")]) {
    await assert.rejects(getApprovedPatients({ fetchImpl: async () => value }), { status: 502 });
  }
  await assert.rejects(getApprovedPatients({ fetchImpl: async () => { throw new Error("network"); } }), { status: 502 });
});
test("times out an upstream request", async () => {
  const fetchImpl = (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  await assert.rejects(getApprovedPatients({ fetchImpl, timeoutMs: 5 }), { status: 504 });
});
