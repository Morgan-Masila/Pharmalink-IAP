const DEFAULT_URL = "https://iap-projects.onrender.com/api/patients";

export class ProducerError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function getApprovedPatients({ fetchImpl = fetch, url = process.env.PRODUCER_PATIENTS_URL || DEFAULT_URL, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const target = new URL(url);
    if (!["https:", "http:"].includes(target.protocol)) throw new Error("Invalid producer URL");
    target.searchParams.set("match_status", "APPROVED");
    const response = await fetchImpl(target, { signal: controller.signal, redirect: "error", headers: { Accept: "application/json" } });
    let body;
    try { body = await response.json(); } catch { throw new ProducerError(502, "Invalid response from patient service"); }
    // The producer uses this particular 404 response for an empty result.
    if (response.status === 404 && body?.message === "There are currently no patients with the requested match status") return [];
    if (!response.ok) throw new ProducerError(502, "Patient service unavailable");
    if (!Array.isArray(body)) throw new ProducerError(502, "Invalid response from patient service");
    return body.map((patient) => {
      if (!patient || !Number.isSafeInteger(patient.patient_id) || patient.patient_id <= 0 || typeof patient.name !== "string" || !patient.name.trim() || (patient.phone_number !== null && typeof patient.phone_number !== "string")) {
        throw new ProducerError(502, "Invalid response from patient service");
      }
      return { patient_id: patient.patient_id, name: patient.name, phone_number: patient.phone_number };
    });
  } catch (error) {
    if (error instanceof ProducerError) throw error;
    if (controller.signal.aborted) throw new ProducerError(504, "Patient service timed out");
    throw new ProducerError(502, "Patient service unavailable");
  } finally {
    clearTimeout(timer);
  }
}
