# PharmaLink Kenya

See FIX-NOTES.md for setup, migration instructions, tests, and important limitations. The database/schema.sql file deletes existing tables and is intended only for a new development database. The application requires a running backend and database; it does not substitute demo data when they are unavailable.

## Local ports

The backend now uses port 5001 by default, and the frontend sends API requests to `http://localhost:5001/api`. This avoids an unrelated service that may already use port 5000. If you choose a different backend port, set the same URL in `frontend/.env` as `VITE_API_URL` and restart Vite.
