# Backend Changes & Deployment Checklist

This document details all modifications introduced to the DrNutrident backend codebase, the automated test verification results, and the exact step-by-step checklist for redeploying to Render.

---

## 1. Summary of Changes by Workstream

### Workstream A: Authentication & Session Revocation
- **User Model Versioning** (`backend/src/models/User.js`): Added `tokenVersion: { type: Number, default: 0 }`.
- **JWT Middleware Enforcement** (`backend/src/middleware/auth.middleware.js`): Every authenticated request verifies that the token's payload `tokenVersion === user.tokenVersion`. If they mismatch, the request is immediately rejected with `401 Unauthorized` (`The session was signed out. Please sign in again.`).
- **Logout Endpoint** (`backend/src/controllers/auth.controller.js`): Implemented `POST /api/auth/logout`. Increments `tokenVersion` on the User document, immediately invalidating all outstanding JWTs across all devices.
- **Deactivation Revocation**: Deactivating a staff member or doctor increments their `tokenVersion`, instantly severing any active sessions.
- **Cache-Control Headers** (`backend/src/middleware/noStore.middleware.js`): Mounted `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` across all API responses.

### Workstream D: Security Hardening
- **Environment Validation** (`backend/src/config/validateEnv.js`): Wired into `server.js` startup. In production, startup immediately halts if `JWT_SECRET` or `JWT_REFRESH_SECRET` are missing, shorter than 32 characters, or identical to each other.
- **Constant-Time OTP & Lockout** (`backend/src/controllers/auth.controller.js`): Used `crypto.timingSafeEqual` with zero-padded buffers for OTP comparison. Enforces a 5-attempt limit resulting in a 15-minute lockout (`otpLockUntil`), and a 60-second cooldown on resends.
- **Safe Webhook JSON Parsing** (`backend/src/controllers/payment.controller.js`): Wrapped `JSON.parse(req.rawBody)` in a try-catch block to prevent malformed webhook payloads from crashing the server.
- **FDI 32 Adult Teeth Validation** (`backend/src/validators/dentalChart.validator.js`): Enforces adult FDI teeth numbers:
  - Upper Right: 11–18
  - Upper Left: 21–28
  - Lower Left: 31–38
  - Lower Right: 41–48
  Rejects pediatric (51–85) or invalid teeth numbers with descriptive validation errors. Validates patient existence before inserting chart data.
- **Medical Record Download Authorization** (`backend/src/controllers/medicalRecord.controller.js`): Implemented `GET /api/medical-records/:id/download`. Authorizes strictly the patient owner, treating dentist, or receptionist/admin. Blocks unauthorized file retrieval.
- **Clinic Timezone Reminders** (`backend/src/jobs/appointmentReminder.job.js`): Time calculations use `process.env.CLINIC_TIMEZONE || 'Asia/Kolkata'` using date-fns-tz UTC boundaries, preventing timezone drift or duplicate reminders.
- **Reschedule Payment Pointer Separation** (`backend/src/controllers/appointment.controller.js`): Rescheduling sets `paymentStatus: 'pending'` and does not copy refunded payment pointers to new appointments.
- **Staff Deactivation Safeguards** (`backend/src/controllers/staff.controller.js`): Deactivation is prevented if the user is deactivating themselves, if they are the last active administrator, or if they are the sole registered dentist.

### Workstream B: Single-Dentist Practice Conversion
- **Order of Routes**: Registered `GET /dentists/primary` and `GET /dentists/primary/slots` **before** `GET /dentists/:id` in `backend/src/routes/dentist.routes.js` to prevent Express from matching `'primary'` as a MongoDB ObjectId.
- **Primary Doctor Profile** (`backend/src/controllers/dentist.controller.js`): `GET /api/dentists/primary` returns the registered chief dental practitioner and their reviews.
- **Primary Doctor Slots**: `GET /api/dentists/primary/slots` calculates clinic-timezone slot availability without requiring a doctor ID parameter.
- **Single-Dentist Database Enforcement**: `POST /api/dentists` checks if a dentist record already exists. If so, it returns `409 Conflict: Single-dentist mode is active. Only one clinician account may exist.`

### Workstream C: Feature Completion
- **Walk-in Patient Registration** (`backend/src/controllers/patient.controller.js`): `POST /api/patients` registers walk-in visitors. Generates a deterministic unique email placeholder (`${cleanPhone}@walkin.drnutrident.com`) if email is not provided, satisfying MongoDB unique indexes without schema migration.
- **Staff Appointment Booking** (`backend/src/controllers/appointment.controller.js`): `POST /api/appointments/staff` creates and auto-confirms visits for walk-ins or registered patients with staff override.
- **Profile Photo Upload** (`backend/src/controllers/auth.controller.js`): `PATCH /api/auth/me/photo` handles avatar uploads using Multer and Cloudinary.
- **Email Notifications via Brevo**: `appointmentReminder.job.js` and controllers integrate transactional notifications for bookings, cancellations, and doctor alerts.
- **Prescription PDF Download** (`backend/src/controllers/prescription.controller.js`): Generates PDF documents for patient download via `downloadPdf`.

---

## 2. Automated Test Verification (100% Pass)

### Backend (Jest + mongodb-memory-server)
Run from `backend/`: `npm test`
- `src/__tests__/singleDentistAndSecurity.test.js`: 8 tests passed
- `src/__tests__/authSession.test.js`: 4 tests passed
- `src/utils/__tests__/security.utils.test.js`: 7 tests passed
- `src/utils/__tests__/appointmentAccess.test.js`: 4 tests passed
- `src/utils/__tests__/queueAccess.test.js`: 3 tests passed
- `src/utils/__tests__/pendingExpiry.test.js`: 2 tests passed
- `src/utils/__tests__/seedAdminConfig.test.js`: 3 tests passed
**Total: 7 suites, 31 tests passed (0 failures).**

### Frontend (Vitest + MSW)
Run from `frontend/`: `npm test -- --run`
- `src/api/domains.test.js`: 10 tests passed
- `src/api/capabilities.test.js`: 8 tests passed (fallback logic for pre-redeploy compatibility)
- `src/components/ui.test.jsx`: 2 tests passed
- `src/utils/booking.test.js`: 2 tests passed
- `src/App.test.jsx`: 2 tests passed
**Total: 5 files, 24 tests passed (0 failures).**

### Frontend Production Build
Run from `frontend/`: `npm run build`
- Vite build succeeds cleanly with 0 TypeScript/JSX errors in 1.8s.

### Playwright End-to-End Suite
Run from `frontend/`: `npx playwright test`
- Chromium: 5 passed (13.5s)
- WebKit (Safari): 5 passed (18.9s)
- Features verified in real browser:
  1. A1: Proper logout, token wipe, Back/Forward cache immunity, multi-tab sync, protected re-entry denial.
  2. B: Public `/doctor` ("Meet your doctor") showcase, legacy `/dentists` URL redirects.
  3. B: Direct single-doctor booking `/app/book` with slot picker (no doctor dropdown).
  4. C: Receptionist walk-in patient registration and automated staff booking modal.
  5. B/C: Admin single doctor profile with "Accepting visits" toggle and prevention of adding additional dentists once on file.

---

## 3. Render Redeployment Checklist

Follow these steps in exact order to deploy the refactored backend to your live Render service (`https://drnutrident-backend-wj1n.onrender.com`):

### Step 1: Verify Environment Variables on Render Dashboard
Log in to your Render Dashboard, open the `drnutrident-backend-wj1n` service, navigate to **Environment**, and verify that the following variables are configured:

| Variable Name | Required Value / Description | Check |
|---|---|---|
| `NODE_ENV` | `production` | [ ] |
| `PORT` | `10000` (or Render default) | [ ] |
| `MONGO_URI` | Your production MongoDB connection string | [ ] |
| `JWT_SECRET` | 64+ random characters (minimum 32 required by `validateEnv`) | [ ] |
| `JWT_REFRESH_SECRET` | 64+ random characters (must NOT equal `JWT_SECRET`) | [ ] |
| `JWT_EXPIRES_IN` | `15m` | [ ] |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | [ ] |
| `CORS_ORIGINS` | Comma-separated allowed frontend URLs (e.g. `https://drnutrident.com,https://drnutrident.vercel.app`) | [ ] |
| `TRUST_PROXY` | `1` (Render runs behind an AWS reverse proxy) | [ ] |
| `CLINIC_TIMEZONE` | `Asia/Kolkata` | [ ] |
| `RAZORPAY_KEY_ID` | Your Razorpay Key ID | [ ] |
| `RAZORPAY_KEY_SECRET` | Your Razorpay Secret | [ ] |
| `RAZORPAY_WEBHOOK_SECRET` | Your Razorpay Webhook Secret | [ ] |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name | [ ] |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | [ ] |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | [ ] |
| `BREVO_API_KEY` | Brevo API key for transactional email | [ ] |
| `EMAIL_FROM` | Sender address (e.g. `care@drnutrident.com`) | [ ] |
| `AGORA_APP_ID` | Agora App ID for video consultations | [ ] |
| `AGORA_APP_CERTIFICATE` | Agora App Certificate | [ ] |

> [!IMPORTANT]
> `validateEnv.js` will immediately abort startup if `JWT_SECRET` and `JWT_REFRESH_SECRET` are identical or under 32 characters. Ensure both are unique and cryptographically secure.

### Step 2: Push Code to Git & Trigger Deployment
```bash
git add backend/ frontend/ docs/
git commit -m "feat: complete single-dentist conversion, security hardening, and session revocation"
git push origin main
```
On Render:
1. Click **Manual Deploy** -> **Deploy latest commit** (or let auto-deploy run).
2. Monitor deployment logs for:
   - `✓ Environment validation passed.`
   - `✓ Connected to MongoDB.`
   - `✓ Clinic reminder cron initialized.`
   - `Server running on port ...`

### Step 3: Post-Deployment Smoke Test (Read-Only)
Run a curl or browser check against the live deployment:
```bash
curl -I https://drnutrident-backend-wj1n.onrender.com/api/clinic-settings
```
Expected response:
- Status `200 OK`
- Header: `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`
- Response body contains `{ "success": true, ... }`

Verify primary doctor endpoint:
```bash
curl https://drnutrident-backend-wj1n.onrender.com/api/dentists/primary
```
Expected response:
- Status `200 OK`
- Response body contains the chief dental practitioner and their reviews.

### Step 4: Frontend Deployment
Deploy the frontend build to your hosting provider (Vercel, Netlify, or static host):
1. Build command: `npm run build`
2. Output directory: `dist`
3. Environment variables:
   - `VITE_API_BASE_URL=https://drnutrident-backend-wj1n.onrender.com/api`
   - `VITE_SOCKET_URL=https://drnutrident-backend-wj1n.onrender.com`
   - `VITE_CLINIC_TIMEZONE=Asia/Kolkata`
4. Verify response headers include `Cache-Control: no-store` on HTML routes to ensure session privacy across browser tabs and back buttons.