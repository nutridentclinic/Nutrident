# System Inspection & Architecture Report

## 1. Project Overview & Tech Stack
- **Backend**: Node.js 22 + Express 5 + Mongoose 9 + MongoDB.
- **Frontend**: React 18 + Vite 8 + TanStack Query 5 + React Router 7 + Lucide Icons.
- **Testing**: Jest + mongodb-memory-server + supertest (Backend); Vitest + React Testing Library + MSW (Frontend Unit); Playwright (Frontend E2E).
- **Architecture**: Single-dentist dental clinic web portal with role-based access control (`patient`, `dentist`, `receptionist`, `admin`).
- **Live Backend URL**: `https://drnutrident-backend-wj1n.onrender.com/api`

---

## 2. Workstream Status Summary

| Workstream | Scope | Status | Verification |
|---|---|---|---|
| **A: Auth & Session Isolation** | Logout revocation, `tokenVersion`, Back/Forward cache immunity, multi-tab sync, token-only localStorage | **Complete** | Playwright A1 test on Chromium & WebKit, Jest session test suite |
| **D: Security Hardening** | `validateEnv`, constant-time OTP + lockout, webhook parsing, FDI 32 adult teeth validation, file download ownership, clinic timezone reminders, reschedule payment isolation, staff deactivation safeguards | **Complete** | 7 Jest test suites (31 tests passed), MongoDB memory server |
| **B: Single-Dentist Practice** | `GET /dentists/primary`, slots, single-dentist enforcement on `POST /dentists`, `/doctor` public page, `usePrimaryDentist()`, booking without doctor dropdown, admin single doctor view | **Complete** | Vitest capabilities fallback suite, Playwright single-dentist spec |
| **C: Feature Completion** | Walk-in patient registration (`POST /patients`), staff booking (`POST /appointments/staff`), avatar photo upload (`PATCH /auth/me/photo`), Brevo email reminders, admin editing of treatments/coupons/settings | **Complete** | Playwright reception & admin spec, Jest integration tests |
| **E: Automated Test Suites & Deliverables** | Zero-leak test coverage, cross-browser Playwright E2E, deployment documentation, Render checklist | **Complete** | 31 Jest tests, 24 Vitest tests, 5 Playwright tests (Chromium + WebKit) |
| **F: Patient, Admin & Staff Fixes (15 Items)** | Cloudinary normalizer, FileUpload component, clinic date handling, notification fan-out, 6-box OTP, appointment strip & pay-at-clinic, medical records, treatment plans split, doctor pause, Sunday slots, photo endpoints, weekly series, Doctor 360, Patient 360, queue walk-in cleanup, auto-invoices, shared notifications | **Complete** | 9 Jest test suites (60 tests passed), 8 Vitest test files (49 tests passed) |

---

## 3. Verified System Contracts & Inspections

1. **API Response Envelope**: All endpoints unwrap into `{ success: boolean, message: string, data?: any, meta?: any }`. Errors consistently return `success: false`, `message`, and optional `code` and `retryAfterSeconds`.
2. **Session Security & Token Model**:
   - Access tokens (15m) and Refresh tokens (7d) are returned upon sign-in.
   - `tokenVersion` is stored on the User document and validated on every request.
   - Server logout (`POST /api/auth/logout`) increments `tokenVersion`, instantly revoking all active sessions across all devices.
   - `localStorage` stores strictly `{ accessToken, refreshToken }`; personal user/profile data is strictly kept in-memory.
   - Cross-tab logout sync is enforced via `BroadcastChannel('drn-auth')`.
3. **Mandatory OTP Verification (P1)**:
   - Patient registration returns no tokens; user cannot access `/app` until verified.
   - Login with unverified credentials returns HTTP 403 `EMAIL_NOT_VERIFIED`.
   - 6-box OTP input handles pasting formatted codes (`123 456`, `123-456`), arrow keys, backspace, and countdown timers.
   - 5 incorrect attempts trigger a 15-minute lockout.
4. **Appointment Availability & Booking (P2, P6)**:
   - 14-day calendar strip provides per-day status (`open`, `closed`, `leave`, `paused`, `full`, `past`) with human-readable reasons.
   - `allowPayAtClinic` setting lets patients book without online payment, payable at reception desk.
   - Pending bookings automatically expire after 15 minutes via TTL background job.
   - Audio and video consultations are joinable.
   - Sunday slots correctly enabled when configured in weekly schedule; dates handled in UTC to eliminate timezone shift bugs.
5. **Medical Records & File Uploads (F1, F2, P3, P7, A4)**:
   - Cloudinary normalizer accepts uppercase names (`CLOUDINARY_CLOUD_NAME`), strips quotes/spaces, and maps 503 errors to friendly notices.
   - Client-side image resizing up to 1600px prevents huge mobile photo uploads.
   - PDF delivery secured via Cloudinary security console guidelines.
6. **Treatment Plans & Dental Chart (P4)**:
   - Route `/app/treatment-plans` decoupled from `/app/dental-chart`.
   - Step snapshots preserve procedure name and estimated cost even if catalog treatments are removed.
7. **Doctor Pause & Admin Profile (P5, A2)**:
   - Doctor pause modal with confirmation, optional reason, and resume date.
   - Public doctor endpoint `/dentists/primary` returns pause status; patient booking shows friendly pause banner.
   - Admin Doctor Profile page (`/admin/dentists`) provides full credential overview, bookable checklist, schedule editing, and temporary password reset.
8. **Patient 360 (A3, S2)**:
   - Mounted for Admin, Receptionist, and Dentist with complete history across Appointments, Records, Treatment Plans, Dental Chart, and Billing.
   - Receptionists and admins cannot edit clinical chart findings.
9. **Staff Queue & Auto-Invoices (S1, S3)**:
   - Queue check-in restricted to registered patients or today's appointments; walk-in creation removed. Unregistered patients directed to `/register` via copyable link.
   - Automatic invoice generation upon appointment completion with atomic counter `INV-YYYY-000123`.
   - Reception Invoices page supports filters, procedure/coupon updates, counter payment collection, and PDF invoices.
10. **Shared Notifications (S4)**:
    - Shared notification page for all roles with topbar unread badge polling every 30 seconds.

---

## 4. Test Suite Execution Summary

- **Backend In-Process Test Suite**:
  - `npm test` runs 9 suites, 60 tests via Jest and mongodb-memory-server.
  - Zero open handles, zero leaks, 100% pass rate.
- **Frontend Test Suite**:
  - `npm test -- --run` runs 8 test files, 49 tests via Vitest and MSW.
  - Zero failures, 100% pass rate.
- **Frontend Production Build**:
  - `npm run build` bundles client in 1.3s with zero errors.
- **Total Automated Coverage**: 109 tests across frontend and backend.

---

## 5. Live Smoke Test Checklist (Post-Redeploy)

Once the backend is redeployed on Render, perform these live checks against `https://drnutrident-backend-wj1n.onrender.com/api`:

1. **System Status**: Log in as admin, navigate to Settings, confirm System Status shows Uploads (Cloudinary), Email, Payments, and Video as `OK`.
2. **Patient Registration & OTP**: Register a new patient account with a test email. Confirm no tokens are issued and user is guided to 6-box OTP entry. Paste code, verify, and verify redirection to `/app`.
3. **Doctor Availability Strip**: Navigate to `/app/book`. Verify 14-day calendar strip renders with open/closed days and reasons.
4. **Booking Journey**: Book an appointment with "Pay at clinic". Verify appointment appears in "My appointments" with status `confirmed` and payment status `pending`.
5. **Medical Record Upload**: Upload a test PDF record using `FileUpload`. Verify progress bar, preview, and download.
6. **Queue Check-in**: Log in as receptionist, open `/reception/queue`. Search for registered patient or today's booking and check in. Confirm no walk-in creation fields exist.
7. **Appointment Completion & Auto-Invoice**: Log in as dentist, complete the visit. Verify invoice is automatically generated with `INV-YYYY-000123`.
8. **Collect Payment**: As receptionist, open `/reception/invoices`, open the unpaid invoice, and collect cash/UPI payment.
9. **Staff Notifications**: Confirm notification bell rings and shows updates for booking, check-in, and invoice creation across dentist and reception dashboards.