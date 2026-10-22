# Local Setup

## Prerequisites

- Node.js 22.12+
- npm
- MongoDB development database
- Provider credentials only for the integrations being exercised

## Install and Run

1. Copy `backend/.env.example` to `backend/.env`; set `MONGO_URI`, distinct 64-byte-or-longer JWT secrets, and development CORS origins.
2. Copy `frontend/.env.example` to `frontend/.env`.
3. From `backend/`: `npm install`, then `npm run dev`.
4. From `frontend/`: `npm install`, then `npm run dev`.
5. Open the Vite URL (normally `http://localhost:5173`).

For the first administrator, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_PHONE` in `backend/.env`, then run `npm run seed` from `backend/`. Do not use production data for local development.

## Environment

Backend variables and placeholders are listed in `backend/.env.example`. Provider secrets are backend-only. `CORS_ORIGINS` is a comma-separated list; set `TRUST_PROXY=1` only behind a trusted single proxy. `CLINIC_TIMEZONE` controls backend slot/video windows.

Frontend variables are public: `VITE_API_BASE_URL` includes `/api`; `VITE_SOCKET_URL` is the Socket.IO origin without `/api`; `VITE_CLINIC_TIMEZONE` defaults to `Asia/Kolkata`.

## Tests

- Backend: from `backend/`, run `npm test`.
- Frontend: from `frontend/`, run `npm test`, `npm run lint`, and `npm run build`.

The current automated tests cover utility policies and configuration. They do not spin up MongoDB, mock all controllers/providers, or execute end-to-end user flows.