# PharmaLink API

PharmaLink is a REST API that helps patients in Kenya find which nearby pharmacies currently have a medicine in stock, reserve it for pickup, and record a payment. Pharmacies use the same API to register, log in, and keep their stock up to date. It is built for the PharmaLink web app, and for any developer who wants to build on pharmacy stock data.

- **Interactive reference (every endpoint, every field):** open [`docs/index.html`](docs/index.html) in a browser, or visit `https://REPLACE-WITH-YOUR-GITHUB-PAGES-URL`
- **Base URL (local):** `http://localhost:5000/api`

## Quickstart: one copy-paste command

Find pharmacies in Westlands that have Panadol in stock:

```bash
curl "http://localhost:5000/api/stock/search?medicine=Panadol&location=Westlands"
```

You should get `200` and a JSON array like this (`latitude` and `longitude` vary slightly per pharmacy):

```json
[
  {
    "id": 1,
    "pharmacy_id": 1,
    "medicine": "Panadol",
    "name": "Sunrise Pharmacy",
    "area": "Westlands",
    "location": "Westlands",
    "distance": null,
    "eta": null,
    "quantity": 15,
    "price": 220,
    "verified": false,
    "latitude": -1.261907,
    "longitude": 36.8045
  }
]
```

If you get `[]`, the API is running but has no Panadol in Westlands yet. Load sample data with `npm run seed` (see [Run it locally](#run-it-locally)), or create your own with the [walkthrough](#endpoints-a-working-example-of-each) below.

> **Windows users:** run the commands in this README in **Git Bash** or **WSL**. PowerShell and `cmd` handle quotes in JSON differently, so the examples will not paste correctly there.

---

## Conventions

- Send and receive **JSON**. Requests with a body need the header `Content-Type: application/json`.
- All successful responses are JSON (`200` for reads and updates, `201` for creates).
- **Every error is JSON of the form `{ "message": "<what went wrong>" }`**. See [Errors](#errors).
- IDs are integers. Prices are numbers in Kenyan shillings. Timestamps are ISO 8601 strings.

---

## Authentication

Most endpoints are **public**. Only a pharmacy changing its own stock needs to log in:

| Needs a token | Public (no token) |
|---|---|
| `POST /inventory`, `PATCH /inventory/{id}` | Everything else: health, pharmacies, reading stock, stock search, register, login, reservations, payments |

**How to get and use a token**

1. Register a pharmacy (once): `POST /auth/register`
2. Log in: `POST /auth/login`. The response contains a `token`.
3. Send it on protected requests in the `Authorization` header:

```bash
export TOKEN="paste-the-token-from-the-login-response-here"

curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/inventory?pharmacy_id=1
```

A token lasts **8 hours**. After that, protected requests return `401` and you log in again. A pharmacy can only change **its own** stock: the pharmacy is taken from the token.

---

## Endpoints: a working example of each

Follow these in order on an empty database and you will get the same responses shown. Where a later request needs a value from an earlier response (a token, an id), the text says so.

### 1. Health check: `GET /health`

```bash
curl http://localhost:5000/api/health
```

`200`
```json
{ "status": "ok", "service": "PharmaLink API" }
```

### 2. Register a pharmacy: `POST /auth/register`

Body: `name` (string, up to 120 characters), `area` (one of `Nairobi CBD`, `Westlands`, `Eastleigh`, `Kisumu`, `Mombasa`), `password` (string, at least 6 characters).

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Sunrise Pharmacy","area":"Westlands","password":"secret123"}'
```

`201`
```json
{ "id": 1, "name": "Sunrise Pharmacy", "area": "Westlands", "verified": false }
```

Errors: `400` invalid input (for example an area outside the list), `409` a pharmacy with that name already exists.

### 3. Log in: `POST /auth/login`

Body: `name`, `password`.

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"Sunrise Pharmacy","password":"secret123"}'
```

`200` (the token is shortened here; yours is much longer)
```json
{
  "id": 1,
  "name": "Sunrise Pharmacy",
  "area": "Westlands",
  "verified": false,
  "token": "eyJhbGciOiJIUzI1NiIsInR5c..."
}
```

Copy the whole `token` value into `export TOKEN="..."`. Errors: `400` missing name or password, `401` wrong name or password.

### 4. Add a medicine to your stock: `POST /inventory` (token required)

Body: `medicine` (string), `quantity` (whole number, 0 or more), `price` (number, 0 or more), optional `status` (default `"In stock"`).

```bash
curl -X POST http://localhost:5000/api/inventory \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"medicine":"Panadol","quantity":20,"price":250}'
```

`201`
```json
{
  "id": 1,
  "pharmacy_id": 1,
  "medicine": "Panadol",
  "quantity": 20,
  "price": 250,
  "status": "In stock",
  "updated_at": "2026-10-14T23:36:34.000Z"
}
```

The `id` here is the stock item's id; you need it for the update below. Errors: `400` invalid input, `401` missing or invalid token, `403` the body's `pharmacy_id` is not yours, `409` that medicine is already in your stock.

### 5. List a pharmacy's stock: `GET /inventory`

Query: `pharmacy_id` (required).

```bash
curl "http://localhost:5000/api/inventory?pharmacy_id=1"
```

`200` (an empty array `[]` if the pharmacy has no stock or does not exist)
```json
[
  { "id": 1, "medicine": "Panadol", "quantity": 20, "price": 250, "status": "In stock" }
]
```

### 6. Update a stock item: `PATCH /inventory/{id}` (token required)

Body: **all three** of `quantity`, `price`, `status` are required, even if you only change one.

```bash
curl -X PATCH http://localhost:5000/api/inventory/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity":15,"price":220,"status":"In stock"}'
```

`200`
```json
{
  "id": 1,
  "pharmacy_id": 1,
  "medicine": "Panadol",
  "quantity": 15,
  "price": 220,
  "status": "In stock",
  "updated_at": "2026-10-14T23:36:34.000Z"
}
```

Errors: `400` invalid input, `401` missing or invalid token, `404` no item with that id in **your** stock.

### 7. List pharmacies: `GET /pharmacies`

Optional query: `verified=true|false`, and `lat` + `lng` (send both, or neither) to get `distance` in kilometres and an `eta`.

```bash
curl http://localhost:5000/api/pharmacies
```

`200`
```json
[
  { "id": 1, "name": "Sunrise Pharmacy", "location": "Westlands", "distance": null, "eta": null, "verified": false }
]
```

`distance` and `eta` are `null` unless you send `lat` and `lng`.

### 8. Search for a medicine: `GET /stock/search`

Query: `medicine` and `location` (both required, partial and case-insensitive matches). Optional `lat` + `lng` for distance and nearest-first ordering. Only items that are `In stock` with quantity above 0 are returned.

```bash
curl "http://localhost:5000/api/stock/search?medicine=Panadol&location=Westlands&lat=-1.2864&lng=36.8172"
```

`200`
```json
[
  {
    "id": 1,
    "pharmacy_id": 1,
    "medicine": "Panadol",
    "name": "Sunrise Pharmacy",
    "area": "Westlands",
    "location": "Westlands",
    "distance": 3.1,
    "eta": "9 minutes",
    "quantity": 14,
    "price": 220,
    "verified": false,
    "latitude": -1.261907,
    "longitude": 36.8045
  }
]
```

`id` is the stock item's id and `pharmacy_id` is the pharmacy's id. Use `pharmacy_id` and `medicine` to make a reservation. No matches returns `200` and `[]`. Errors: `400` missing `medicine` or `location`, or only one of `lat`/`lng`.

### 9. Reserve a medicine: `POST /reservations`

Body: `pharmacy_id`, `medicine`, `patient_initials` (up to 10 characters), `pickup_window` (free text). The server creates the reservation code and takes one unit out of stock.

```bash
curl -X POST http://localhost:5000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"pharmacy_id":1,"medicine":"Panadol","patient_initials":"MK","pickup_window":"2:00 PM - 3:00 PM"}'
```

`201`
```json
{ "id": 1, "reservation_code": "RES-PQ9PMCRM", "status": "Reserved" }
```

Errors: `400` invalid input, `404` the pharmacy does not stock that medicine, `409` it is out of stock.

### 10. Record a payment: `POST /payments`

Body: `type` (for example `"M-Pesa"`), `amount` (number above 0), optional `reservation_id`, optional `status` (default `"Confirmed"`).

```bash
curl -X POST http://localhost:5000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"type":"M-Pesa","amount":220,"reservation_id":1}'
```

`201`
```json
{
  "id": 1,
  "time": "02:36 AM",
  "type": "M-Pesa",
  "amount": 220,
  "reservation_id": 1,
  "status": "Confirmed"
}
```

`time` is Nairobi time. Errors: `400` invalid input or a `reservation_id` that does not exist.

> This endpoint **records** a payment. It does not move money or contact M-Pesa.

---

## Errors

Every failed request returns a non-2xx status and a JSON body with a single `message` field. Check the **status code** first, then read `message`.

```json
{ "message": "Inventory item not found for this pharmacy" }
```

| Status | Meaning | Real example |
|---|---|---|
| `400` | Invalid or missing input | `GET /inventory` with no `pharmacy_id` → `{ "message": "pharmacy_id is required" }` |
| `401` | No token, bad token, or wrong login | `POST /inventory` with no token → `{ "message": "Login required" }` |
| `403` | The body's `pharmacy_id` is not yours | `{ "message": "You can only modify your own inventory" }` |
| `404` | Not found | `PATCH /inventory/9999` → `{ "message": "Inventory item not found for this pharmacy" }` |
| `409` | Conflict | Adding the same medicine twice → `{ "message": "This medicine is already in your inventory" }` |
| `413` | Request body over 10 KB | `{ "message": "Request body too large" }` |
| `429` | Too many login or register attempts (20 per 15 minutes) | `{ "message": "Too many attempts, please try again later" }` |
| `500` | Unexpected server error | `{ "message": "Server error" }` |

Unknown URLs return `404` with `{ "message": "Endpoint not found" }`. Malformed JSON returns `400` with `{ "message": "Invalid JSON body" }`.

---

## Run it locally

Requirements: **Node.js 18 or newer** (tested on Node 22) and **MySQL 8.0.16 or newer**, running.

```bash
# 1. Get the code
git clone <YOUR-REPO-URL>
cd <YOUR-REPO-FOLDER>/backend

# 2. Install dependencies
npm install

# 3. Create the database and tables (this DELETES any existing pharmalink data)
mysql -u root -p < schema.sql

# 4. Create the settings file (change DB_PASSWORD, and use any long random JWT_SECRET)
cat > .env <<'EOF'
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your-mysql-password
DB_NAME=pharmalink
JWT_SECRET=change-me-to-a-long-random-string
CORS_ORIGIN=http://localhost:5173
EOF

# 5. (Optional) load sample pharmacies and medicines
npm run seed

# 6. Start the API
npm start
```

You should see `PharmaLink API running on http://localhost:5000`. Check it from a second terminal:

```bash
curl http://localhost:5000/api/health
```

Expected: `{"status":"ok","service":"PharmaLink API"}`

The server refuses to start without `JWT_SECRET`. If it exits immediately, check step 4.

### Run the automated tests

Create a separate empty database once, then run the suite. The tests wipe and rebuild `pharmalink_test`, never `pharmalink`.

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS pharmalink_test"
npm test
```

### Rebuild the docs page after editing `openapi.yaml`

```bash
npx @redocly/cli lint openapi.yaml
npx @redocly/cli build-docs openapi.yaml -o docs/index.html
```
