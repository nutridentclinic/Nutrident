# DrNutrident — Dental Clinic Management Platform

DrNutrident is a complete dental-clinic management platform consisting of a Node.js/Express/MongoDB backend and a React 18 / Vite frontend. It delivers role-based experiences for four user types: **Patients**, **Dentists**, **Receptionists**, and **Administrators**, integrated with Razorpay test-mode payments, Agora video consultations, and real-time Socket.IO waiting queue updates.

---

## Table of Contents

1. [Features by Role](#features-by-role)
2. [Technology Stack](#technology-stack)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Environment Setup](#environment-setup)
6. [Database Seeding](#database-seeding)
7. [Running the Application](#running-the-application)
8. [Running Tests & Linting](#running-tests--linting)
9. [Production Build & Deployment](#production-build--deployment)
10. [Security & Token Storage Trade-off](#security--token-storage-trade-off)
11. [Summary of Changes Made](#summary-of-changes-made)
12. [Required External Credentials & Limitations](#required-external-credentials--limitations)

---

## Features by Role

### 1. Patient Portal (`/app`)
- **Dashboard**: Upcoming appointments overview, quick booking CTA, dental health metrics.
- **Appointment Booking (`/app/book/:dentistId`)**: Stepper for slot selection (clinic timezone), visit mode (in-clinic / video), reason for visit, family member assignment, fee summary, and Razorpay checkout.
- **Appointments (`/app/appointments`)**: Filter by status, cancel with reason & clinic refund policy copy, reschedule with automatic navigation to new appointment, join video consultation.
- **Prescriptions (`/app/prescriptions`)**: Authenticated PDF downloads (`/api/prescriptions/:id/pdf`).
- **Medical Records (`/app/records`)**: Upload records (X-ray, lab report, prescription) as multipart form data (`file`), filter by type, open Cloudinary files directly, and delete.
- **Care & Dental Chart (`/app/care`)**: View ongoing treatment plans with step-level statuses; interactive read-only 32-tooth FDI dental chart (numbers 11–18, 21–28, 31–38, 41–48).
- **Billing (`/app/billing`)**: Patient invoice history with PDF download, payment records.
- **Family Members (`/app/family`)**: Manage dependents and book visits on their behalf.
- **Profile & Medical Info (`/app/profile`)**: Manage DOB, blood group, allergies, chronic conditions, emergency contacts, and upload profile photo via Cloudinary.
- **Notifications (`/app/notifications`)**: Real-time 30s polling, unread count badge, mark read, mark all read, email notification preference toggle.

### 2. Dentist Workspace (`/dentist`)
- **First-time Onboarding**: Empty weekly availability automatically redirects to `/dentist/availability`.
- **Dashboard (`/dashboard/dentist/me`)**: Today's schedule, patient count, revenue statistics.
- **Schedule (`/dentist/appointments`)**: Date and status filters; actions: confirm, complete, mark no-show, cancel, join video call.
- **Availability Editor (`/dentist/availability`)**: Weekly schedule windows, slot duration (minutes), unavailable/leave dates, accepting-patients toggle; validated start < end and non-overlapping slots.
- **Patients Directory (`/dentist/patients`)**: List unique patients from appointment history or `GET /dentists/me/patients`.
- **Clinical View (`/dentist/patients/:patientId`)**:
  - **Treatment Plans**: Create plans with steps from treatments catalog (`GET /treatments`), update step status (`planned`, `in-progress`, `completed`).
  - **Prescriptions**: Dynamic medicine rows (name, dosage, frequency, days, instructions) with server validation.
  - **Medical Records**: View uploaded patient records.
  - **Dental Chart**: Interactive 32-tooth FDI grid. Tap any tooth to record condition (caries, filling, extraction, crown, healthy) and clinical notes.
- **Patient Reviews (`/dentist/reviews`)**: View patient ratings and comments; submit dentist reply.
- **Live Queue (`/dentist/queue`)**: Real-time Socket.IO waiting room with 8s polling fallback. Call next patient, skip, or mark complete.

### 3. Front Desk / Receptionist Portal (`/reception`)
- **Dashboard (`/dashboard/receptionist`)**: Queue stats, today's appointments, pending payments, walk-in quick actions.
- **Patient Directory (`/reception/patients`)**: Search registered patients, register new walk-in patients (`POST /api/patients` with duplicate detection), edit demographic info, view history, and upload records on patient behalf.
- **Appointment Lookup (`/reception/appointments`)**: Schedule timeline, book on behalf of patient for the single doctor with slot picker (`POST /api/appointments/staff`), reschedule, confirm, mark no-show, cancel with reason.
- **Live Queue Management (`/reception/queue`)**: Single-doctor auto-selection, check in registered patients or walk-in visitors, call next, skip, complete via Socket.IO with polling fallback.
- **Billing Desk (`/reception/invoices`)**: Create itemized invoices with treatment catalog lookup, see server-computed subtotal, discount, tax, and total; record payments (`cash`, `card`, `upi`, `bank-transfer`); print/download PDF receipts; view Daily Collection Summary and export to CSV.

### 4. Administration Portal (`/admin`)
- **Operations Dashboard**: Single-clinic KPIs (today's queue, 7d/30d new patients, today's/month revenue, outstanding balance, status breakdown, cancellation/no-show rates, weekly appointments chart, monthly revenue, revenue by treatment, and live system status for Cloudinary, Email, Razorpay, Agora, and Firebase).
- **Appointments (`/admin/appointments`)**: Global appointment manager with date range, status, payment filters, patient search, slot picker to book on behalf of patients, reschedule, mark no-show, cancel with refund rules, and CSV export.
- **Doctor Profile (`/admin/dentists`)**: Single-doctor profile management (`siddheshvpatil02@gmail.com`) — edit bio, qualifications, fee, photo, availability, leave dates, accepting-patients toggle. Multi-doctor creation is disabled (`SINGLE_DENTIST_MODE=true`).
- **Staff Management (`/admin/staff`)**: Provision receptionist and admin accounts, edit staff details, reset passwords (`mustChangePassword: true`), activate/deactivate accounts with safeguards against self/last-admin deactivation.
- **Patient Directory (`/admin/patients`)**: Search, register walk-in patients, inspect Patient360, edit demographics, activate/deactivate accounts, upload records on patient behalf.
- **Treatment Catalog (`/admin/treatments`)**: Full CRUD for treatments, base pricing, and duration with confirmation dialogs.
- **Coupons Management (`/admin/coupons`)**: Create, inspect, update, and delete promotional discount coupons.
- **Invoices & Payments (`/admin/payments`)**: Dual-tab view for Invoices and Online Payments/Refunds; mark paid with payment method selection, download invoice PDFs, initiate refunds with reason tracking, inspect Razorpay IDs, and export CSV.
- **Patient Reviews Moderation (`/admin/reviews`)**: Moderate reviews, hide/unhide inappropriate feedback, view doctor replies.
- **Clinic Locations (`/admin/clinics`)**: Single-clinic configuration management for DrNutrident.
- **Clinic Settings (`/admin/settings`)**: Configure clinic name, email, phone, address, hours, platform fee, tax percentage, cancellation refund window, and reminder lead times.

### 5. Video Consultations (Agora RTC)
- Mode check: Enabled strictly for `mode: 'video'` and `status: 'confirmed'`.
- Access window: Permitted from 15 minutes before appointment start to 30 minutes after end; countdown timer displayed outside window.
- Lobby (`/consultation/:id/lobby`): `AgoraRTC.checkSystemRequirements()`, camera and microphone permission test, audio-only fallback option.
- Call Room (`/consultation/:id`): Real `agora-rtc-sdk-ng` client with VP8 codec, dynamic token privilege renewal on expiration, mute/unmute audio, camera toggle, network quality indicator, and connection recovery notices.

### 6. Payment Flow (Razorpay Test Mode)
1. Patient books slot -> backend creates pending appointment.
2. `POST /api/payments/create-order` -> returns Razorpay order ID, amount in paise, and test key ID. Existing open orders are reused idempotently.
3. Razorpay Checkout modal loads on demand.
4. On completion, client submits signature to `POST /api/payments/verify`. Backend validates HMAC signature with `safeCompareHex`, fetches the payment directly from Razorpay to verify amount and captured status, and confirms the appointment.
5. On modal dismiss, network timeout, or payment failure, the client polls `GET /api/appointments/:id` every 3s up to 30s; never assumes success unless the server confirms status `paid`. Provides a retry button if not confirmed.
6. Server-to-server webhook (`POST /api/payments/webhook`) operates with raw body HMAC verification for background confirmation.

---

## Technology Stack

- **Backend**: Node.js >= 22.12, Express 5.2, Mongoose 9, MongoDB Atlas, JWT (HS256) + bcryptjs, Razorpay SDK, Agora Token Builder, Cloudinary + Multer, Socket.IO 4.8, PDFKit, Brevo REST API, node-cron.
- **Frontend**: Vite 8, React 18, Tailwind CSS 4, React Router 7, TanStack Query 5, Zustand 5, Axios, React Hook Form + Zod, Recharts, Agora RTC SDK NG 4.24, Socket.IO Client 4.8, Lucide React icons.

---

## Prerequisites

- **Node.js**: Version 22.12.0 or higher (`node -v`)
- **npm**: Version 10 or higher
- **MongoDB**: A running local MongoDB instance or MongoDB Atlas cluster connection string

---

## Installation

Clone the repository and install dependencies in both folders:

```bash
# 1. Install Backend Dependencies
cd backend
npm install

# 2. Install Frontend Dependencies
cd ../frontend
npm install
```

---

## Environment Setup

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Set the required environment variables:
- `PORT=5000`
- `NODE_ENV=development`
- `CORS_ORIGINS=http://localhost:5173,http://localhost:3000`
- `MONGO_URI=mongodb://localhost:27017/dental_clinic` (or your MongoDB Atlas connection URI)
- `JWT_SECRET=` (at least 64 random characters, e.g. `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
- `JWT_REFRESH_SECRET=` (a separate 64 random character string)
- `JWT_EXPIRES_IN=7d`
- `JWT_REFRESH_EXPIRES_IN=30d`
- `BCRYPT_SALT_ROUNDS=10`
- `CLINIC_TIMEZONE=Asia/Kolkata`
- `PENDING_APPOINTMENT_TTL_MINUTES=15`
- `VIDEO_JOIN_EARLY_MINUTES=15`
- `VIDEO_JOIN_LATE_MINUTES=30`
- `ADMIN_EMAIL=admin@drnutrident.com`
- `ADMIN_PASSWORD=SecureAdminPassword123!`
- `ADMIN_PHONE=+919876543210`
- `ADMIN_NAME=Super Admin`

Optional integration variables (can be populated when testing external providers):
- `RAZORPAY_KEY_ID=rzp_test_...`
- `RAZORPAY_KEY_SECRET=...`
- `RAZORPAY_WEBHOOK_SECRET=...`
- `AGORA_APP_ID=...`
- `AGORA_APP_CERTIFICATE=...`
- `CLOUDINARY_CLOUD_NAME=...`
- `CLOUDINARY_API_KEY=...`
- `CLOUDINARY_API_SECRET=...`
- `BREVO_API_KEY=...`

> [!CAUTION]
> Never place secrets or private keys in version control or frontend environment files. Keep `backend/.env` strictly in `.gitignore`.

### Frontend (`frontend/.env`)

Copy `frontend/.env.example` to `frontend/.env`:

```bash
cp frontend/.env.example frontend/.env
```

Variables:
```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_CLINIC_TIMEZONE=Asia/Kolkata
```

---

## Database Seeding

To initialize clinic default settings, test treatments, and the first administrator account:

```bash
cd backend
npm run seed
```

The seed script reads `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_PHONE` from `backend/.env` and will refuse to execute without them. No default passwords exist.

### Single Doctor Seeding (`npm run seed:doctor`)

To seed the clinic's single doctor account (`siddheshvpatil02@gmail.com`) with default weekly availability (Mon–Sat 09:00–20:00 with lunch break, 30 min slot duration) and deactivate any extraneous dentists:

```bash
cd backend
npm run seed:doctor
```

This script reads `DOCTOR_EMAIL`, `DOCTOR_PASSWORD`, `DOCTOR_PHONE`, `DOCTOR_NAME`, `DOCTOR_SPECIALIZATION`, `DOCTOR_QUALIFICATIONS`, `DOCTOR_EXPERIENCE_YEARS`, and `DOCTOR_CONSULTATION_FEE` from your environment. It is fully idempotent.

---

## Running the Application

### 1. Start the Backend API Server
In a terminal:
```bash
cd backend
npm run dev
```
The server will start at `http://localhost:5000`. Test health with:
```bash
curl http://localhost:5000/api/health
# Response: {"success":true,"message":"API is running"}
```

### 2. Start the Frontend Dev Server
In a second terminal:
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Running Tests & Linting

### Backend Tests
```bash
cd backend
npm test
```
Runs Jest test suites covering CORS origin parsing, video join access & time boundary checks, admin seed configuration, queue role authorization, and pending appointment expiry cutoff.

### Frontend Tests
```bash
cd frontend
npm test
```
Runs Vitest test suites (16 tests) covering API domain mappings, Razorpay error normalization, token refresh handling, multipart medical record upload, booking slot filtering, FDI tooth chart validity (32 teeth), and UI error/retry components.

### Frontend Linting & Build
```bash
cd frontend
npm run lint    # Runs oxlint
npm run build   # Produces production distribution in dist/
```

---

## Production Build & Deployment

### Frontend (Static Host, e.g. Vercel, Netlify, Cloudflare Pages, S3+CloudFront)
1. Build the production client bundle:
   ```bash
   cd frontend
   npm run build
   ```
2. Configure SPA fallback: All routes must rewrite to `index.html`.
3. Set environment variables on your static host:
   - `VITE_API_BASE_URL=https://your-backend-domain.com/api`
   - `VITE_SOCKET_URL=https://your-backend-domain.com`
   - `VITE_CLINIC_TIMEZONE=Asia/Kolkata`
4. Configure Content Security Policy (CSP) headers to permit:
   - `connect-src`: backend API, Socket.IO origin, `*.razorpay.com`, `*.agora.io`, `*.agoralabs.com`
   - `script-src`: `'self'`, `https://checkout.razorpay.com`
   - `frame-src`: `https://api.razorpay.com`, `https://checkout.razorpay.com`
   - `img-src`: `'self'`, `data:`, `blob:`, `https://res.cloudinary.com`
   - `media-src`: `'self'`, `blob:`

### Backend (Node.js Host, e.g. Render, Railway, AWS ECS, VPS)
1. Set `NODE_ENV=production`.
2. Configure `TRUST_PROXY=1` when running behind reverse proxies (Render, Cloudflare, AWS ALB) for accurate IP rate limiting.
3. Configure `CORS_ORIGINS` to contain your exact production frontend domain(s).
4. Register the live Razorpay webhook pointing to `https://your-backend-domain.com/api/payments/webhook`.

---

## Security & Token Storage Trade-off

The backend issues JWT access tokens (7-day validity) and refresh tokens (30-day validity) in response bodies. Because the backend does not set HttpOnly cookies, tokens are stored in browser `localStorage`.
- **Mitigations**:
  - Request interceptors automatically attach the Bearer token.
  - On receiving a 401 on non-auth endpoints, a single shared refresh promise runs and retries the request.
  - Cross-tab logout is handled via `window.addEventListener('storage', ...)`.
  - No secrets or credentials are ever stored in frontend code or Vite environment variables.
  - Strict host-level CSP and sanitization prevent XSS vector execution.

---

## Summary of Changes Made

| Component | Finding / Issue | Fix / Enhancement |
|---|---|---|
| `backend/src/controllers/payment.controller.js` | Proposed E5 missing | Implemented `getAllPayments` with status filtering, date ranges, pagination, and population for Admin. |
| `backend/src/routes/payment.routes.js` | E5 route missing | Mounted `GET /api/payments` restricted to `admin`. |
| `frontend/src/pages/AdminPages.jsx` | Missing Payments & Refunds view | Created `PaymentManagement` component with filters, Razorpay refund execution, and confirm modals. |
| `frontend/src/layouts/PortalLayout.jsx` | Navigation item missing | Added `Payments & refunds` to Admin navigation. |
| `frontend/src/App.jsx` | Admin route missing | Added route `/admin/payments` -> `AdminPage page="payments"`. |
| `frontend/src/pages/ReceptionPages.jsx` | Scoping bug in `InvoiceCreator` | Moved `previewCoupon` and `markPaid` from inside `create` function's `try` block to component scope, enabling coupon preview and mark-paid buttons. |
| `frontend/src/pages/TeamPages.jsx` | FDI tooth numbers & cascading setState | Imported `FDI_TEETH` from `teeth.js` (rendered all 32 teeth); eliminated `setState` in effect for dentist availability duration. |
| `frontend/src/pages/PatientPages.jsx` | Unused import | Removed unused `ConfirmDialog` import to clear lint warning. |
| `frontend/src/components/ui.test.jsx` | Vitest import error | Imported `afterEach` from `vitest` to fix suite failure. |
| `frontend/src/api/domains.test.js` | Multipart file mock in JSDOM | Normalized filename parsing in MSW test to support JSDOM File/Blob handling; added unit test for `api.payments.all`. |
| `frontend/.gitignore` | Untracked `.env` risk | Added `.env`, `.env.*` (excluding `.env.example`) to gitignore. |
| `docs/API.md`, `BACKEND_CHANGES.md`, `KNOWN_LIMITATIONS.md` | Stale documentation | Updated to reflect E5 admin payments and T15 receptionist invoice mark-paid status. |

---

## Required External Credentials & Limitations

For production verification with real third-party services:
1. **Razorpay**:
   - Requires live API Key ID (`rzp_live_...`) and Secret from Razorpay Dashboard.
   - Requires Razorpay Webhook Secret configured with events: `payment.captured`, `payment.failed`, `refund.processed`.
2. **Agora**:
   - Requires Agora App ID and App Certificate from Agora Console.
   - Note: Real two-party video calls require HTTPS (or localhost) and user devices with active camera/microphones.
3. **Cloudinary**:
   - Requires Cloud Name, API Key, and API Secret for real patient photo and medical record delivery.
4. **Brevo**:
   - Requires Brevo API Key and verified sender email for transactional OTP / notification delivery.
5. **MongoDB Atlas**:
   - Production connection string for `MONGO_URI`.