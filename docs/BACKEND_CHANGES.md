# Backend Changes & Deployment Checklist

This document details all modifications introduced to the DrNutrident backend and frontend codebases, the automated test verification results across both suites, and the exact step-by-step checklist for redeploying to Render.

---

## 1. Summary of Changes by Workstream

### Workstream F: Patient, Admin, and Staff Fixes (15 Items)

#### F1. Cloudinary Upload Normalizer & System Status
- **Root Cause**: `backend/src/middleware/upload.middleware.js` required `CLOUDINARY_CLOUD_NAME` to match `/^[a-z0-9_-]+$/` (lowercase only), rejected any value containing `"replace"`, and failed to trim whitespace or quotes. The clinic's production Cloudinary cloud name contains an uppercase letter (valid in Cloudinary), causing every upload to reject with HTTP 503 `"File upload service is not configured on the server yet"`.
- **Backend Fix** (`backend/src/config/cloudinary.js` & `backend/src/middleware/upload.middleware.js`):
  - Normalizer strips surrounding quotes, trims whitespace, accepts `/^[A-Za-z0-9_-]+$/`, and initializes `cloudinary.config({ ..., secure: true })`.
  - Startup logs: `Cloudinary: configured` or `Cloudinary: NOT configured (missing: ...)`.
  - Detailed categorized server logs for failures (missing vars / rejected credentials / unreachable) without leaking secrets.
  - Replaced technical 503 with user-friendly message: `"Uploads are temporarily unavailable. Please try again later or contact the clinic."`.
  - Admin endpoint `GET /api/admin/system-status` performs live `cloudinary.api.ping()` and returns status booleans for uploads, email, payments, and video (*pending backend deploy*).
- **Owner Checklist**: Verify Render environment variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` have no quotes or spaces; in Cloudinary Console under Settings → Security, ensure PDF file delivery is enabled.

#### F2. Unified FileUpload Component
- **Frontend** (`frontend/src/components/FileUpload.jsx`):
  - Single reusable component for medical records, doctor profile photos, avatar photos, and clinic logo.
  - Pre-upload validation: JPG, PNG, WEBP, PDF formats; strictly 10 MB maximum.
  - Client-side image resizing up to 1600px with safe timeout fallback for non-browser test environments.
  - Real-time progress bar via Axios `onUploadProgress`.
  - Double-submit prevention, error mapping (503 to friendly retry notice), and file links opened with `rel="noopener noreferrer"`.

#### F3. Clinic Date Handling & UTC Math
- **Backend** (`backend/src/utils/clinicDate.js`):
  - Added centralized helpers: `parseDateOnly('YYYY-MM-DD')`, `weekdayOf(dateStr)` using UTC date math, `addDays(dateStr, n)`, `dayRange(dateStr)`, `todayInClinic()`, `weekRange(dateStr, startsOn)`.
  - Removed server-local `setHours`/`setDate`/`getDate` across `availability.service.js`, `appointment.controller.js`, `dashboard.controller.js`, `payment.controller.js`, `invoice.controller.js`, and `generateInvoiceNumber.js`.
- **Frontend** (`frontend/src/utils/formatDate.js`):
  - Standardized `formatClinicDate(date, opts)` passing `{ timeZone: 'UTC' }` for appointment dates.
  - Removed bare `new Date(date).toLocaleDateString()` across `PatientPages.jsx`, `TeamPages.jsx`, `ReceptionPages.jsx`, and `AdminPages.jsx`.

#### F4. Notification Fan-Out Helper
- **Backend** (`backend/src/services/notification.service.js`):
  - Implemented `notifyRoles(roles, payload)` and `notifyUser(userId, payload)`.
  - Fan-out events: new appointment booking, cancellation, rescheduling, check-in, invoice creation, and payment collection.

#### F5. Shared 6-Box OTP Input Component
- **Frontend** (`frontend/src/components/OtpInput.jsx`):
  - Six distinct single-digit input boxes. Typing advances cursor; Backspace clears and retreats; Arrow Left/Right navigate.
  - Full-code paste (handles `123 456`, `123-456`) auto-fills all 6 boxes.
  - `inputMode="numeric"`, `pattern="[0-9]*"`, `autoComplete="one-time-code"` on box 1.
  - Accessible `aria-label="Digit n of 6"` in a labeled group with live-region status.
  - Expiry countdown (10:00) and server-driven resend cooldown (`resendAvailableAt`).
  - Stores email in `sessionStorage.pendingVerification` (never exposes user ID in URL).

#### P1. Patient OTP Verification Gate
- **Backend** (`backend/src/controllers/auth.controller.js` & `backend/src/middleware/auth.middleware.js`):
  - `POST /auth/register` creates account with `isEmailVerified: false` and issues no session tokens (`requiresVerification: true`). Overwrites unverified accounts on re-registration.
  - `POST /auth/login` returns HTTP 403 `EMAIL_NOT_VERIFIED` with `{ resendAvailableAt, email }` and sends a fresh code if expired.
  - `protect` middleware immediately rejects unverified patient requests with 403 `EMAIL_NOT_VERIFIED`.
  - 5 failed attempts trigger a 15-minute lockout (`otpLockUntil`); 60-second cooldown enforced on resend.
  - One-off script `scripts/mark-staff-verified.js` ensures staff/dentist accounts remain verified.

#### P2. Appointment System & Availability Strip
- **Backend** (`backend/src/controllers/dentist.controller.js` & `appointment.controller.js`):
  - `GET /api/dentists/:id/availability?from&to` and `GET /api/dentists/primary/availability` return daily status: `open`, `closed`, `leave`, `paused`, `full`, or `past` (*pending backend deploy*).
  - Clinic setting `allowPayAtClinic` (default true) enables patient choice between Pay Online and Pay at Clinic.
  - Pay-at-clinic creates confirmed booking with `paymentStatus: 'pending'` payable at reception desk.
  - Pending booking auto-expiry TTL job (`cancelledBy: 'system'`) cancels unpaid bookings after 15 minutes.
  - Fixed `upcoming=true` query on `GET /api/appointments/me` to include today's appointments.
  - Audio and video consultations joinable via `ConsultationPages.jsx`.
- **Frontend**: 14-day calendar strip showing badges and reasons for closed/full/open days; status filter and pagination on appointments.

#### P3. Medical Record Uploads
- Integrated `FileUpload` with `POST /api/medical-records` allowing JPG/PNG/WEBP/PDF with title and category.
- Shows upload progress bar, empty state, and server error messages.

#### P4. Treatment Plans & Dental Chart Separation
- Separated routes into `/app/treatment-plans` and `/app/dental-chart` (with redirect for `/app/care`).
- Backend populates `dentist.user` for both `getMyPlans` and `getPatientPlans`.
- Copied snapshot of procedure name and estimated cost into each step at creation, preventing null pointer crashes if a treatment catalogue entry is deleted.
- Step progress bars, completed vs estimated cost breakdown, and retry button on network errors.

#### P5. Doctor Appointment Pause & Bookable Checklist
- Public `GET /api/dentists/primary` always returns clinician status (`isAcceptingAppointments`, `pausedReason`, `pausedUntil`, `nextAvailableDate`, `isVerified`).
- Dentist dashboard displays red pause alert with one-click Resume.
- Confirmation modal with optional reason and resume date.
- Patient booking displays friendly notice: `"Dr. X is not taking new appointments until <date>"`.
- Admin bookable checklist validates: verified credentials, accepting visits, weekly schedule set, slot length set, consultation fee set.

#### P6. Sunday & Timezone Consistency
- All date math uses UTC midnights, eliminating date shifts between midnight and 05:30 IST.
- Clinic opening hours displayed on Home, Contact, and Booking pages.
- Sunday slots correctly enabled when day 0 has configured hours.

#### P7. Multi-Role Profile Photo Upload
- `PATCH /api/auth/me/photo` supports `patient`, `dentist`, `receptionist`, and `admin`.
- Updates in-memory user and refreshes topbar/sidebar avatar display.

#### A1. Admin Weekly Appointments Stacked Chart
- Endpoint `GET /api/dashboard/admin/appointments-weekly?range=week|7d|30d&startsOn=mon|sun` returns zero-filled clinic-time series (*pending backend deploy*).
- Accurately counts confirmed, completed, cancelled, and no-show appointments without double-counting rescheduled visits.
- Recharts stacked bar chart with range toggle ("This week" / "Last 7 days") and tooltips.

#### A2. Doctor Profile Administration
- Admin `/admin/dentists` page provides full profile view: credentials, qualifications, fee, weekly hours, leave dates, bookable checklist.
- Edit doctor details via `PATCH /api/dentists/:id` and photo via `PATCH /api/dentists/:id/photo` (*pending backend deploy*).
- Temporary password reset with forced change on next login.
- Feature-detected with `<BackendPendingNotice />` if deployed backend has not yet updated.

#### A3. Patient 360 View
- Mounted at `/admin/patients/:id` and `/reception/patients/:id`.
- Header: photo, name, age/gender, contact, verified badge, next appointment, last visit, outstanding balance.
- Tabs: Overview, Appointments, Prescriptions, Records, Treatment Plans, Dental Chart, Billing.
- Backend endpoints: `GET /api/patients/:id/summary` and `GET /api/patients/:id/appointments` (*pending backend deploy*).
- Read-only protection: receptionists and admins cannot edit clinical chart findings.

#### A4. System Status & Asset Uploads
- Admin Settings includes System Status card backed by `GET /api/admin/system-status`.
- Clinic logo, doctor photo, and patient records use unified `FileUpload`.

#### S1. Queue Check-in Cleaned (No Walk-ins)
- Removed "Register walk-in" modal, button, and raw walk-in fields from Queue UI.
- Check-in restricted to registered patients or today's appointments.
- Displays self-registration link (`/register`) with one-click copy button for unregistered visitors.
- Backend `POST /api/queue/check-in` rejects `walkInName` with HTTP 400. Legacy walk-ins render gracefully as `"Legacy walk-in"`.

#### S2. Staff Patient Information
- Receptionists can access Patient 360 at `/reception/patients/:patientId` with quick actions for check-in and billing.

#### S3. Auto-Invoice Generation & Management
- Auto-generates invoice when dentist marks an appointment as completed.
- Idempotent: unique sparse index on `Invoice.appointment`.
- Atomic sequential invoice numbering: `INV-YYYY-000123`.
- Online payments link to paid invoice; pay-at-clinic generates unpaid invoice payable at desk.
- Reception Invoices page: filter by status/date/patient, add extra procedure items/coupons via `PATCH /api/invoices/:id/items`, collect payment via `mark-paid`, and download PDF invoice.

#### S4. Shared Notifications for All Staff Roles
- Mounted at `/dentist/notifications`, `/reception/notifications`, `/admin/notifications`, and `/app/notifications`.
- Topbar bell with unread badge polls every 30 seconds for all roles.
- Deep links to related appointments, invoices, and patient profiles.

---

## 2. Automated Test Verification Summary

### Backend (Jest + mongodb-memory-server + supertest)
Command: `npm test` from `backend/`
- `src/__tests__/patientAdminStaffFixes.test.js`: 17 tests passed
- `src/__tests__/mandatoryOtpAndResetAndUpload.test.js`: 12 tests passed
- `src/__tests__/singleDentistAndSecurity.test.js`: 8 tests passed
- `src/__tests__/authSession.test.js`: 4 tests passed
- `src/utils/__tests__/security.utils.test.js`: 7 tests passed
- `src/utils/__tests__/appointmentAccess.test.js`: 4 tests passed
- `src/utils/__tests__/queueAccess.test.js`: 3 tests passed
- `src/utils/__tests__/pendingExpiry.test.js`: 2 tests passed
- `src/utils/__tests__/seedAdminConfig.test.js`: 3 tests passed
**Result: 9 test suites, 60 tests ALL PASSING (100%).**

### Frontend (Vitest + React Testing Library + MSW)
Command: `npm test -- --run` from `frontend/`
- `src/pages/PatientAdminStaffViews.test.jsx`: 10 tests passed
- `src/pages/AuthFlows.test.jsx`: 11 tests passed
- `src/api/domains.test.js`: 10 tests passed
- `src/api/capabilities.test.js`: 8 tests passed
- `src/components/FileUpload.test.jsx`: 4 tests passed
- `src/components/ui.test.jsx`: 2 tests passed
- `src/utils/booking.test.js`: 2 tests passed
- `src/App.test.jsx`: 2 tests passed
**Result: 8 test files, 49 tests ALL PASSING (100%).**

### Production Build
Command: `npm run build` from `frontend/`
- Vite production build generates client bundle cleanly in 1.3s with 0 errors.

---

## 3. Render Redeployment Checklist

> [!IMPORTANT]
> **Deployment Order**: Always redeploy the **Backend first** on Render, run the one-off staff verification script, verify system status, and then redeploy the **Frontend**.

### Step 1: Verify Environment Variables on Render
Open your Render service dashboard (`drnutrident-backend-wj1n`) -> **Environment** and verify:

| Variable Name | Required Value / Description | Check |
|---|---|---|
| `NODE_ENV` | `production` | [ ] |
| `PORT` | `10000` | [ ] |
| `MONGO_URI` | Production MongoDB connection string | [ ] |
| `JWT_SECRET` | 64+ random characters (minimum 32 required) | [ ] |
| `JWT_REFRESH_SECRET` | 64+ random characters (must NOT equal `JWT_SECRET`) | [ ] |
| `OTP_SECRET` | 32+ random characters for HMAC OTP hashing | [ ] |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary name (**no surrounding quotes, no spaces**; uppercase is valid) | [ ] |
| `CLOUDINARY_API_KEY` | Cloudinary API Key (**no quotes, no spaces**) | [ ] |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret (**no quotes, no spaces**) | [ ] |
| `BREVO_API_KEY` | Brevo API key for transactional emails and OTP | [ ] |
| `EMAIL_FROM` | Sender address (e.g. `care@drnutrident.com`) | [ ] |
| `CLINIC_TIMEZONE` | `Asia/Kolkata` | [ ] |
| `RAZORPAY_KEY_ID` | Razorpay Key ID | [ ] |
| `RAZORPAY_KEY_SECRET` | Razorpay Secret | [ ] |
| `AGORA_APP_ID` | Agora App ID for video/audio consultations | [ ] |
| `AGORA_APP_CERTIFICATE` | Agora App Certificate | [ ] |

### Step 2: Configure Cloudinary Security Console
1. Log in to [Cloudinary Console](https://cloudinary.com/console).
2. Go to **Settings** -> **Security**.
3. Under **PDF and ZIP files delivery**, ensure PDF delivery is **allowed / enabled**.

### Step 3: Trigger Backend Deploy on Render
1. Push the updated `backend/` commit to your repository.
2. Trigger deploy on Render.
3. Check startup logs for:
   - `✓ Environment validation passed.`
   - `Cloudinary: configured`
   - `✓ Connected to MongoDB.`
   - `Server running on port 10000`

### Step 4: Run One-Off Staff Verification Script
```bash
# Preview unverified staff accounts:
node backend/scripts/mark-staff-verified.js --dry-run

# Mark staff, dentist, and admin accounts as verified:
node backend/scripts/mark-staff-verified.js --apply
```

### Step 5: Verify Live System Status (Admin)
```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://drnutrident-backend-wj1n.onrender.com/api/admin/system-status
```
Expected output:
```json
{
  "success": true,
  "data": {
    "uploads": true,
    "email": true,
    "payments": true,
    "video": true,
    "cloudinaryPing": "ok"
  }
}
```

### Step 6: Deploy Frontend
1. Build command: `npm run build`
2. Publish directory: `dist`
3. Environment variables:
   - `VITE_API_BASE_URL=https://drnutrident-backend-wj1n.onrender.com/api`
   - `VITE_SOCKET_URL=https://drnutrident-backend-wj1n.onrender.com`

---

## 4. Endpoints Pending Backend Deploy

The following endpoints were added to `backend/` and are supported on the frontend with automatic feature detection via `src/api/capabilities.js`. Until the backend is redeployed on Render, the frontend gracefully falls back or shows `<BackendPendingNotice />`:

1. `GET /api/admin/system-status` - System integration health and live Cloudinary ping.
2. `GET /api/dentists/:id/availability` & `GET /api/dentists/primary/availability` - 14-day calendar strip with reason codes.
3. `PATCH /api/auth/me/photo` - Avatar photo upload for all roles.
4. `GET /api/dashboard/admin/appointments-weekly` - Weekly appointments series zero-filled in clinic time.
5. `PATCH /api/dentists/:id` & `PATCH /api/dentists/:id/photo` - Admin doctor profile updates.
6. `POST /api/dentists/:id/reset-password` - Admin-initiated temporary doctor password reset.
7. `GET /api/patients/:id/summary` - Patient 360 clinical and billing overview.
8. `GET /api/patients/:id/appointments` - Patient appointment history.
9. `PATCH /api/invoices/:id/items` - Receptionist procedure and coupon adjustments on unpaid invoices.