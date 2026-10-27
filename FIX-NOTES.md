# Fix notes and setup

Registration now returns an eight-hour login token, so the dashboard can load approved patients and update inventory immediately. Existing names still return HTTP 409, including concurrent registrations; use Login for an existing account. Login and registration do not reveal passwords.

For a new development database, import database/schema.sql and optionally database/seed.sql. WARNING: schema.sql drops existing tables and data. For an existing database, back it up first and run database/migrate_legacy_pharmacies.sql to make legacy distance and eta columns optional. This migration addresses the known legacy columns; it does not automatically reconcile other schema differences. Compare your existing tables with schema.sql before making other changes.

Copy backend/.env.example to backend/.env, set your MySQL credentials and a strong unique JWT_SECRET. Copy frontend/.env.example to frontend/.env. In each directory run npm ci, then npm run dev. Do not share your .env files. The package excludes private environment files, node_modules and built output.

Approved patients requires a valid pharmacy token. Expired tokens require logging in again; the external patient service must also be available. Every authenticated pharmacy can currently see the returned patient contact details; review whether that access is appropriate before using real patient data. The service can return 502/504 when the upstream service fails.

Tests: from backend run node --test producer-patients.test.js route.test.js registration.test.js; from frontend run npm run build. Full registration, inventory and migration tests require a running MySQL instance and should be performed against a disposable database before deployment.

