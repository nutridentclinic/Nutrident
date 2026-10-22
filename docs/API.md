# API Integration

Base URL is `VITE_API_BASE_URL` (default `http://localhost:5000/api`). The Axios layer unwraps the backend envelope into `{ data, message, meta }`. Errors expose `status`, `message`, and `fieldErrors`; server messages are shown without replacing them with mock success.

## Auth

- `POST /auth/login`, `POST /auth/register`, `POST /auth/verify-otp`, `POST /auth/resend-otp`
- `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/refresh-token`
- `GET /auth/me`, `PATCH /auth/update-password`

On non-auth 401 responses one shared refresh request updates both persisted tokens and retries once. Refresh failure clears the session and sends the user to `/login?reason=expired`.

## Public and Booking

- `GET /dentists` with search, specialization, city, minRating, maxFee, sort, page, limit
- `GET /dentists/:id`, `GET /dentists/:id/slots?date=YYYY-MM-DD`
- `GET /treatments`, `GET /clinic-settings`, `GET /clinics`
- `POST /appointments`, `POST /payments/create-order`, `POST /payments/verify`
- `GET /appointments/me`, `GET /appointments/:id`, cancel/reschedule routes
- `POST /appointments/:id/video/join` for server-issued Agora credentials

Prices are displayed from dentist/settings data, then replaced by saved appointment fees after create. Razorpay success is shown only when the verification response confirms the payment and appointment; dismiss/failure/network outcomes poll appointment status for up to 30 seconds.

## Patient Care

- `GET/PATCH /patients/me`, family member routes
- `GET /prescriptions/me`, `GET /prescriptions/:id/pdf`
- `GET /medical-records/me`, upload `POST /medical-records` as multipart field `file`, delete route
- `GET /treatment-plans/me`, `GET /dental-charts/:patientId`
- `GET /invoices/me`, invoice PDF, `GET /payments/me`
- Notifications list/read/preferences routes; notifications poll every 30 seconds.

## Dentist and Staff

- `GET /appointments/dentist/me`, appointment actions, `PATCH /dentists/me`, availability routes
- `GET /dentists/me/patients` (E2), with appointment-history fallback when the deployed API returns 404
- Review list/reply; treatment plan, prescription, medical record, and chart actions
- `GET /queue/dentist/:dentistId`; Socket.IO `queue:join`, `queue:updated`, `queue:leave`, with 8-second polling fallback
- Reception invoice creation `POST /invoices`, staff list `GET /invoices`, PDF download, and external settlement `PATCH /invoices/:id/mark-paid`
- Reception appointment list `GET /appointments` (E3) and dashboard `GET /dashboard/receptionist` (E4), with 404 fallback to ID lookup where applicable
- Admin dentist list `GET /dentists/admin/all` (E1), staff, treatment catalog, coupons, clinics, clinic settings, and payments & refund management `GET /payments` (E5) and `POST /payments/:id/refund`

Appointment coupon input is not accepted by `POST /appointments`; coupons apply to invoices only.