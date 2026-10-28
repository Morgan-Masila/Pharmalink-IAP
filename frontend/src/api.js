const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001/api";
const AUTH_TOKEN_KEY = "pharmalink-auth-token";

function getStoredToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredToken(token) {
  if (!token) {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore storage errors
    }
    return;
  }

  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore storage errors
  }
}

export function clearStoredToken() {
  setStoredToken("");
}

async function request(path, options = {}) {
  const token = getStoredToken();
  const headers = new Headers({ "Content-Type": "application/json" });

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...Object.fromEntries(headers.entries()),
        ...(options.headers || {})
      }
    });
  } catch (networkError) {
    const error = new Error("Backend unreachable");
    error.isNetworkError = true;
    throw error;
  }

  if (!response.ok) {
    let message = `API request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // ignore non-JSON errors
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export function searchStock(medicine, location) {
  const query = new URLSearchParams({
    medicine,
    location: location || "Nairobi CBD"
  });
  return request(`/stock/search?${query.toString()}`);
}

export function createReservation(payload) {
  return request("/reservations", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function registerPharmacy(payload) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  }).then((data) => {
    if (data?.token) {
      setStoredToken(data.token);
    }
    return data;
  });
}

export function loginPharmacy(payload) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  }).then((data) => {
    if (data?.token) {
      setStoredToken(data.token);
    }
    return data;
  });
}

export function getPharmacies() {
  return request("/pharmacies");
}

export function getInventory(pharmacyId) {
  const query = pharmacyId ? `?${new URLSearchParams({ pharmacy_id: pharmacyId }).toString()}` : "";
  return request(`/inventory${query}`);
}

export function getApprovedPatients() {
  return request("/approved-patients");
}

export function addInventoryItem(payload) {
  return request("/inventory", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateInventoryItem(id, payload) {
  return request(`/inventory/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function createPayment(payload) {
  return request("/payments", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
