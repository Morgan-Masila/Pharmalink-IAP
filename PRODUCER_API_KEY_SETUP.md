# Approved patients API key integration

1. Copy `backend/.env.example` to `backend/.env` if needed, and keep your existing MySQL and JWT settings.
2. Add `PRODUCER_API_KEY=<your key>` to `backend/.env`. Do not put the key in the frontend or commit `.env`.
3. The default request header is `x-api-key`. If your producer documentation specifies `Authorization: Bearer <key>`, set `PRODUCER_API_KEY_HEADER=authorization`. Confirm the required format with the producer.
4. Run `npm install` and `npm run dev` in `backend`. Its default API port is 5001.
5. Run `npm install` and `npm run dev` in `frontend`. `VITE_API_URL` must point to `http://localhost:5001/api` if backend uses port 5001.
6. Log in as a pharmacy, open the dashboard, and click Refresh patients. The frontend sends the PharmaLink login token to the local backend, and the backend sends the producer API key to the external service.
7. A 401 from the local route means the pharmacy login token is missing or invalid. A 502 may mean the producer rejected the API key or returned an unexpected response. Check producer documentation and server logs.

The supplied API key was not embedded in this ZIP because it was shared in chat. Rotate it before production use. Live producer authentication has not been verified.
