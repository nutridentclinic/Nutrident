# Backend Changes

Backend changes are additive or narrowly scoped. Existing route names and response envelopes were preserved.

| Finding | Change | Verification |
|---|---|---|
| T02 | Added comma-separated `CORS_ORIGINS`; local 5173/3000 fallback outside production; Express and Socket.IO share the configured origins. | `security.utils.test.js` origin parsing/fallback cases. |
| T03 | Set Express `trust proxy` from `TRUST_PROXY`, defaulting to 0. | App syntax check; helper suite. |
| T04 / S-01 | Video join now requires appointment patient or owning dentist, video mode, confirmed status, paid status, configured Agora, and clinic-time join window. Timestamps are saved only after checks/token creation. | `appointmentAccess.test.js` participant and exact time-boundary cases. |
| T05 / S-02 | Reschedule checks patient/dentist ownership or admin role and only accepts pending/confirmed source appointments. | Controller syntax check; no database integration test. |
| T06 / S-03 | Dentist confirm/complete/no-show checks ownership; state transitions are constrained. Confirm requires payment unless receptionist/admin explicitly sends `staffOverride: true`. | Controller syntax check; no database integration test. |
| T07 / S-04 | Refunds require admin or owning dentist, paid/partially-refunded state, and a positive amount no greater than the remaining balance. | Payment service/controller syntax checks; no Razorpay refund was executed. |
| T08 / E1, F-01, B-04 | Added `GET /dentists/admin/all` with filters/pagination and correct total; escaped every user-controlled regex in dentist, patient, staff, and clinic search. | Regex utility tests; controller syntax checks. |
| T09 / S-09 | Removed password fields from dentist and staff creation response data. | Controller syntax checks; no credentialed DB integration test. |
| T10 / S-11–S-13 | Reuses open appointment orders; rejects non-pending appointments; verifies HMAC in constant time, fetches the Razorpay payment and matches order/amount/currency/captured status and owner; conditional payment state advancement; protects webhook signature and secret; handles captured cancelled appointments and `refund.processed`. | Signature comparison unit tests and syntax checks. Razorpay was not configured or called. |
| T11 / B-01 | Added a minute cron to cancel unpaid pending appointments older than `PENDING_APPOINTMENT_TTL_MINUTES`; `cancelledBy: system` is now valid. | `pendingExpiry.test.js` cutoff test. |
| T12 / B-02 | Availability uses date-only UTC boundaries and clinic-local dates/times; past days and elapsed slots are excluded. | `appointmentAccess.test.js` timezone conversion test; no Mongo-backed slot test. |
| T13 / S-10 | Queue REST reads and socket joins require receptionist/admin or the owning dentist; invalid JWTs are rejected; check-in requires patient ID or walk-in name; token index is unique with duplicate-key retries. | `queueAccess.test.js` ownership cases; syntax checks. Index rollout needs duplicate-data precheck. |
| T14 | Staff listing explicitly selects `active`. | Controller syntax check. |
| T15 / B-11 | Staff invoice listing (`GET /invoices`), external settlement (`PATCH /invoices/:id/mark-paid`), item validation, and staff coupon preview with `userId` on `POST /coupons/validate`. | Controller syntax checks; verified in frontend invoice flow. |
| T16 / E2–E4 | Added dentist patient list, paginated appointment list for receptionist/admin, and receptionist dashboard counts. | Controller syntax checks; no Mongo-backed tests. |
| T17 | Seed now requires `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_PHONE`; no default password or credential logging. | `seedAdminConfig.test.js`; no database seeding run. |
| E5 | Added `GET /api/payments` (admin) with status filter, date ranges, pagination, and patient/appointment population; enabled admin payments management and refund processing in the portal. | Frontend API test `api.payments.all`; controller/route syntax checks. |

## Not Applied

- P2 care-relationship scoping across every clinical endpoint, audit logging, private file delivery, OTP attempt limits, and dental-chart tooth validation remain outstanding.