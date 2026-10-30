# API Integration Guide

Base URL is `VITE_API_BASE_URL` (default `https://drnutrident-backend-wj1n.onrender.com/api`). The Axios layer (`client.js`) unwraps the backend envelope into `{ data, message, meta }`. Errors expose `status`, `message`, and `fieldErrors`; server messages are displayed without being overridden. All responses include `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` to guarantee Back/Forward cache immunity and multi-user privacy.

---

## 1. Authentication & Session Security

- `POST /auth/login`: Authenticate with email and password. For verified accounts, returns `{ user, accessToken, refreshToken }`. For unverified patients, returns HTTP 403 `{ success: false, message, code: 'EMAIL_NOT_VERIFIED', email, resendAvailableAt }` with no tokens; sends a new OTP if >60s cooldown elapsed.
- `POST /auth/register`: Patient account registration as unverified. Returns `{ email, userId, requiresVerification: true, otpSent, resendAvailableAt }` with 201 Created and no tokens. Overwrites abandoned/squatted unverified accounts for that email.
- `POST /auth/verify-otp`: Accepts `{ email, otp }` (or `userId`). On success sets `isEmailVerified: true`, clears OTP state, and returns `{ user, accessToken, refreshToken }`. Constant-time comparison (`crypto.timingSafeEqual`), 5-attempt limit resulting in 15-minute lockout (429 with `retryAfterSeconds`).
- `POST /auth/resend-otp`: Accepts `{ email }`. Neutral response with `resendAvailableAt`. Enforces 60-second cooldown and 5 sends per hour per account.
- `POST /auth/forgot-password`: Accepts `{ email }`. Issues purpose `'reset'` OTP with neutral response (same shape and timing for unknown emails to prevent enumeration).
- `POST /auth/verify-reset-otp`: Accepts `{ email, otp }`. Validates reset OTP, single-use, returns `{ resetToken, expiresInSeconds: 600 }`.
- `POST /auth/reset-password`: Accepts strictly `{ resetToken, password }`. Single-use token, sets `passwordChangedAt = now`, marks `isEmailVerified = true`, increments `tokenVersion`, invalidates earlier sessions, and returns no tokens. Requests in legacy format (`email + otp + password`) fail with 400.
- `POST /auth/refresh-token`: Rotates access and refresh tokens. Verified against active `tokenVersion` and rejects unverified patients with 403 `EMAIL_NOT_VERIFIED`.
- `POST /auth/logout`: Server-side token invalidation. Increments `tokenVersion` on the User document, immediately invalidating all outstanding JWTs across all active devices.
- `GET /auth/me`: Validates active token and `tokenVersion`, returning fresh `{ user, profile }`.
- `PATCH /auth/update-password`: Updates password, sets `passwordChangedAt = now`, and increments `tokenVersion`.
- `PATCH /auth/me/photo`: Uploads or updates profile photo using multipart field `photo`.

> **Session Isolation & Token Lifecycle**: Auth store persists strictly `{ accessToken, refreshToken }` in `localStorage['drn-auth']`. Unverified patient accounts cannot enter the application portal. Cross-tab logout synchronization is maintained via `BroadcastChannel('drn-auth')` and the `storage` event. All JWTs issued before `passwordChangedAt` are rejected by `protect` and `refreshToken`.

---

## 2. Public & Single-Dentist Consultation

- `GET /dentists/primary`: Returns the clinic's dedicated chief dental clinician profile and verified patient reviews.
- `GET /dentists/primary/slots?date=YYYY-MM-DD`: Returns clinic-timezone slots for the primary doctor. Filters past slots automatically.
- `GET /dentists`: Legacy list endpoint (supports `limit=1` graceful capability fallback).
- `GET /dentists/:id`: Legacy doctor detail endpoint.
- `GET /dentists/:id/slots?date=YYYY-MM-DD`: Legacy doctor slots endpoint.
- `GET /treatments`: Public catalog of dental treatments and starting fees.
- `GET /clinic-settings`: Public clinic metadata (operating hours, clinic phone, WhatsApp, map link, fees, terms, privacy).
- `POST /appointments`: Patient appointment creation (`dentistId`, `date`, `startTime`, `mode`, `reasonForVisit`).
- `POST /payments/create-order`: Generates Razorpay order for an appointment.
- `POST /payments/verify`: Cryptographic HMAC verification of Razorpay payment signature before status advancement.
- `POST /payments/webhook`: Safe JSON parsed webhook receiver supporting `payment.captured` and `refund.processed`.
- `GET /appointments/me`: Patient's appointments list.
- `GET /appointments/:id`: Appointment details.
- `PATCH /appointments/:id/cancel`: Cancellation with refund policy window verification.
- `PATCH /appointments/:id/reschedule`: Reschedule with payment pointer isolation (pending state reset).
- `POST /appointments/:id/video/join`: Timezone-bounded, participant-verified Agora RTC token generator.

---

## 3. Patient Care & Medical Records

- `GET /patients/me`, `PATCH /patients/me`: Patient profile management.
- `GET /medical-records/me`: Patient's own records.
- `POST /medical-records`: Multipart file upload with MIME type validation (`file`).
- `GET /medical-records/:id/download`: Secure file download strictly authorized to the patient owner, treating dentist, or receptionist/admin.
- `GET /treatment-plans/me`: Proposed clinical treatment plans and phases.
- `GET /dental-charts/:patientId`: 32 adult teeth chart (FDI notation: 11–18, 21–28, 31–38, 41–48).
- `GET /invoices/me`, `GET /invoices/:id/pdf`: Billing and downloadable invoice PDF.
- `GET /notifications/me`, `PATCH /notifications/:id/read`, `PATCH /notifications/me/read-all`: Patient notification center.

---

## 4. Receptionist & Clinical Staff

- `POST /patients`: Walk-in patient account registration (`name`, `phone`, `email?`, `dateOfBirth?`, `gender?`, `bloodGroup?`, `address?`). If email is omitted, a unique deterministic identifier is generated.
- `POST /appointments/staff`: Front-desk appointment creation for registered or walk-in patients (`patientId`, `date`, `startTime`, `mode`, `reasonForVisit`, `paymentChoice`). Auto-confirms visit with staff override.
- `GET /appointments`: Paginated appointments directory with date, status, and patient search filters.
- `PATCH /appointments/:id/confirm`: Confirm visit with explicit `staffOverride: true` capability for in-person cash/counter payments.
- `PATCH /appointments/:id/no-show`: Mark visit as no-show.
- `GET /queue/dentist/:dentistId?date=YYYY-MM-DD`: Real-time queue entries. Socket.IO events: `queue:join`, `queue:updated`, `queue:leave`.
- `POST /queue/check-in`: Patient check-in by patient account ID or walk-in visitor name.
- `POST /invoices`: Create detailed invoice with treatment itemization, custom items, and coupon application.
- `GET /invoices`: Staff invoice registry with search and status filters.
- `PATCH /invoices/:id/mark-paid`: Staff counter settlement (`upi`, `cash`, `card`, `netbanking`).
- `GET /dashboard/receptionist`: Today's operational summary counts.

---

## 5. Doctor & Clinical Management

- `GET /appointments/dentist/me`: Doctor's daily schedule.
- `PATCH /dentists/me`: Update qualifications, experience, about text, and consultation fee.
- `GET /dentists/me/patients`: Patients under the doctor's care.
- `PATCH /dentists/me/toggle-active`: Toggle clinician availability.
- `POST /dental-charts`: Save tooth findings with strict FDI 32 adult teeth validation (quadrants 1–4, teeth 1–8).
- `POST /treatment-plans`: Formulate multi-stage treatment plan.
- `GET /reviews/dentist/me`, `POST /reviews/:id/reply`: Review moderation and responses.
- `GET /notifications/me`: Clinician notification alerts for new bookings and cancellations.

---

## 6. Administration

- `GET /dentists/admin/all`: Doctor administration overview.
- `POST /dentists`: Single-dentist creation. Enforces a 409 Conflict if a clinician is already registered in the practice.
- `PATCH /dentists/:id`: Update doctor details or toggle `isAcceptingAppointments`.
- `PATCH /dentists/:id/verify`: Verify clinician medical credentials.
- `GET /staff`, `POST /staff`: Manage staff accounts.
- `PATCH /staff/:id/activate`, `PATCH /staff/:id/deactivate`: Deactivation is blocked for oneself, the last active administrator, or the clinic's sole dentist.
- `GET /treatments`, `POST /treatments`, `PATCH /treatments/:id`: Manage treatment catalog.
- `GET /coupons`, `POST /coupons`, `PATCH /coupons/:id`: Manage discount coupons.
- `GET /payments`, `POST /payments/:id/refund`: Financial ledger and refund execution.
- `GET /clinic-settings`, `PATCH /clinic-settings`: Manage clinic metadata, fees, cancellation windows, operating hours, and legal policies.
- `GET /admin/system-status`: Admin-only live operational status diagnostics for external services (Cloudinary uploads with live ping, Brevo email, Razorpay payments, Agora video).