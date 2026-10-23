# Known Limitations & Deferred Modules

This document outlines intentional design decisions, deferred modules, and external service requirements for DrNutrident.

---

## 1. Resolved Limitations (Fully Implemented)

The following items from initial audits have been completely resolved and verified:
- [x] **Token Invalidation & Logout**: Implemented `POST /api/auth/logout`, User `tokenVersion`, multi-tab broadcast logout, and Back/Forward cache immunity (`no-store`).
- [x] **Session Data Storage**: Personal user and patient profile information is kept strictly in-memory; only access and refresh tokens are persisted in `localStorage`.
- [x] **OTP Attempt Limits & Lockout**: 5-attempt limit with 15-minute lockout and constant-time comparison (`crypto.timingSafeEqual`).
- [x] **FDI 32 Adult Teeth Validation**: Dental chart entries enforce teeth 11–18, 21–28, 31–38, 41–48 and verify patient existence.
- [x] **Medical Record File Authorization**: File downloads require patient ownership, treating clinician role, or receptionist/admin permissions.
- [x] **Single-Dentist Architecture**: Primary doctor endpoints, `/doctor` public showcase, direct booking, and single-clinician database enforcement.
- [x] **Walk-in Patient Flow**: Receptionist registration (`POST /api/patients`) with automatic unique email generation and automated staff booking modal.
- [x] **Profile Photo Upload**: Implemented `PATCH /api/auth/me/photo` with Cloudinary integration.
- [x] **Admin Updates**: Treatment catalog and coupon management now support direct editing (`PATCH`) from the admin interface.
- [x] **Mandatory Email OTP Verification**: Patient accounts cannot access the application until their emailed 6-digit OTP is verified; unverified login returns 403 `EMAIL_NOT_VERIFIED` with resend cooldown; staff accounts remain unaffected.
- [x] **Two-Step Password Reset**: Dedicated 3-step sequence (`/forgot-password` -> `/reset-password/verify` -> `/reset-password/new`) with single-use `resetToken`; single-step password reset is rejected with 400.
- [x] **Upload Configuration & Cloudinary Normaliser**: Normaliser accepts case-sensitive/uppercase cloud names, strips wrapping quotes and whitespace, logs startup status without printing secrets, returns user-actionable text on 503, and provides admin system status monitoring (`GET /api/admin/system-status`).

---

## 2. Active External Service Requirements

- **Razorpay Payments**:
  - The integration runs in test mode using Razorpay Test Key ID and Secret.
  - Payment orders are verified via HMAC signature verification (`crypto.timingSafeEqual`).
  - Transitioning to live payments requires clinic business documentation and updating `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in production environment variables.
- **Agora Video Consultations**:
  - Requires `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` configured on Render for token generation.
  - Video consultation browser testing requires webcam/microphone permissions and an HTTPS origin.
- **Brevo Transactional Emails**:
  - Requires a verified sender domain in `EMAIL_FROM` and valid `BREVO_API_KEY` on Render to deliver live emails.

---

## 3. Deferred Modules & Client Decisions

- **Diet & Nutrition Module**:
  - Intentionally omitted from active clinic navigation and workflows pending clinic owner decision on dietary consultation offerings.
  - Backend models and controllers remain uncoupled from diet workflows to maintain clean dental clinic focus.
- **Appointment Coupon Input**:
  - `POST /appointments` rejects coupon codes by design; discounts are applied at the invoice settlement stage by receptionist or administrative staff.