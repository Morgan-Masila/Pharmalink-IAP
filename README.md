# PharmaLink API

PharmaLink is a REST API for pharmacy stock discovery and medicine reservations.

See FIX-NOTES.md for setup, migration instructions, tests, and important limitations. The database/schema.sql file deletes existing tables and is intended only for a new development database. The application requires a running backend and database; it does not substitute demo data when they are unavailable.

## Local ports

The backend uses port 5001 by default, and the frontend sends API requests to `http://localhost:5001/api`. This avoids an unrelated service that may already use port 5000. If you choose a different backend port, set the same URL in `frontend/.env` as `VITE_API_URL` and restart Vite.

## Quickstart

```bash
export API_KEY="<your-api-key>"

curl -H "X-API-Key: $API_KEY" "http://localhost:5001/api/pharmacies"
curl -H "X-API-Key: $API_KEY" "http://localhost:5001/api/stock/search?medicine=Panadol&location=Westlands"
```

The API key is required on every endpoint except `GET /api/health`.

## Authentication

PharmaLink uses two separate authentication layers:

1. API key (`X-API-Key` header)
   - Required on every endpoint except `GET /api/health`.
   - Issued privately to each consumer by the API owner.
   - Never put a real key in code or documentation; use the placeholder `<your-api-key>` only.
   - Failure response:
     ```json
     { "message": "Missing or invalid API key" }
     ```

2. Login token (JWT) in the `Authorization: Bearer <token>` header
   - This is only used for `POST /api/inventory` and `PATCH /api/inventory/{id}`.
   - Failure response:
     ```json
     { "message": "Login required" }
     ```

A request with a valid API key but no JWT is still rejected for the write routes with the login error. A request with no API key fails before any JWT check is reached.

## Errors

| Status | Meaning |
|---|---|
| 401 | Missing or invalid API key (`{"message":"Missing or invalid API key"}`) |
| 401 | Login required for inventory writes (`{"message":"Login required"}`) |
| 400 | Invalid request payload or missing fields |
| 404 | Resource not found |
| 409 | Duplicate or conflicting record |
| 500 | Internal server error |

## Run it locally

1. Copy the example env files if needed:
   - `backend/.env.example` to `backend/.env`
   - `frontend/.env.example` to `frontend/.env`
2. Set the backend environment variables, including `API_KEYS`.
3. Generate and append a development key in Git Bash or bash:

```bash
echo "API_KEYS=dev:$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")" >> .env
```

The server refuses to start without `API_KEYS`.

4. Install dependencies, then start the app:

```bash
cd backend && npm ci && npm run dev
cd frontend && npm ci && npm run dev
```

## Example calls

### Health check (public)

```bash
curl http://localhost:5001/api/health
```

### Register a pharmacy

```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"name":"Sunrise Pharmacy","area":"Westlands","password":"secret123"}'
```

### Log in

```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"name":"Sunrise Pharmacy","password":"secret123"}'
```

### List pharmacies

```bash
curl -H "X-API-Key: $API_KEY" "http://localhost:5001/api/pharmacies"
```

### Search stock

```bash
curl -H "X-API-Key: $API_KEY" "http://localhost:5001/api/stock/search?medicine=Panadol&location=Westlands"
```

### Add inventory

```bash
curl -X POST http://localhost:5001/api/inventory \
  -H "Authorization: Bearer <jwt-token>" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"medicine":"Panadol","quantity":20,"price":250}'
```

### Update inventory

```bash
curl -X PATCH http://localhost:5001/api/inventory/1 \
  -H "Authorization: Bearer <jwt-token>" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"quantity":15,"price":220,"status":"In stock"}'
```

## Notes

- Do not commit real `.env` files.
- The backend exits immediately if `API_KEYS` is missing or malformed.
- `GET /api/health` is intentionally public for uptime checks.
