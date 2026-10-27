# PharmaLink approved-patient integration

These files apply to the PharmaLink backend from backend.zip, not to the GitHub repository. The GitHub repository contains the producer service; its GET /api/patients returns patient_id, name and phone_number. No producer repository changes are needed.

## Install

1. Back up your existing PharmaLink backend/server.js. Copy the files in this package's backend folder into your project's backend folder, replacing server.js and .env.example. The included server.js is based on the uploaded archive; if your local copy differs, merge the changes instead of overwriting it. package.json is unchanged and included for reference.
2. Use Node.js 18 or newer (built-in fetch required). In the backend directory run `npm ci`. Configure MySQL, JWT_SECRET and CORS_ORIGIN as described in your existing project README. Add this optional setting to backend/.env if you need to override the producer URL:

   PRODUCER_PATIENTS_URL=https://iap-projects.onrender.com/api/patients

3. Start with `npm start`. Authenticate using the existing POST /api/auth/login endpoint. Call GET /api/approved-patients with `Authorization: Bearer <token>`. Example:

   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/approved-patients

The result is an array of objects containing patient_id, name and phone_number. An empty result is `[]`. The backend makes a fresh request with match_status=APPROVED on each call; it does not store or create patient accounts. The service returns 502 for an upstream failure or invalid response, and 504 for a timeout. A missing or invalid token returns 401. Existing pharmacy login grants access; review whether this is appropriate for your patient-contact data and restrict access further if needed. The upstream URL is server configuration, not a request parameter.

## Tests

From backend, run `node --test producer-patients.test.js route.test.js`. The route test uses existing dev dependencies and a local loopback connection; it does not need MySQL or contact the producer. These tests cover the mapping, empty result, errors, timeout, authorization and health endpoint. They do not replace end-to-end testing with your database or a review of permissions. The live producer was checked separately and returned HTTP 200 with the three expected fields.

## Frontend demonstration

Copy frontend/src/App.jsx and frontend/src/api.js into the corresponding frontend/src folder in the uploaded PharmaLink project. Back up or merge them if your versions differ. In frontend, run `npm ci` and `npm run dev`. Ensure VITE_API_URL points to the running backend (the default is http://localhost:5000/api). Open the frontend, choose Pharmacy, and log in with an existing pharmacy account. The dashboard displays Approved patients, with loading, empty and error messages; use Refresh patients to request the latest data. Log out clears the displayed list. This is a live call, so the backend and producer must be reachable. The frontend build was verified; a live browser demo with your account and database has not been verified.
