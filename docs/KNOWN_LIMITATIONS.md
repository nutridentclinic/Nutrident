# Known Limitations

## Backend/API

- Appointment coupon input is not accepted by `POST /appointments`; coupon UI is omitted from booking. Coupons apply to invoices where validation occurs server-side, with optional staff preview via `userId`.
- Dentist profile photo editing, review/plan care-relationship scoping, audit log, private file delivery, OTP attempt limits, and dental-chart tooth validation are not fully addressed.
- Cold-start notice after five seconds is not implemented; requests use a 30-second Axios timeout and surface the normalized network error.
- 429 responses are normalized with a 60-second `retryAfter`, but forms do not yet enforce a visible per-button cooldown.
- Treatment, coupon, and clinic screens currently support create/deactivate flows but not every update operation exposed by the backend.
- Existing backend data should be checked for duplicate queue tokens before the new unique index is deployed.
- Existing `.env` was not read. Rotate any credentials that were shared or committed previously.

## External Services and Testability

- Razorpay requires test key ID/secret and a webhook secret on the backend. No real card/UPI payment was run. Use only Razorpay test instruments until the account is explicitly moved to live mode.
- Agora requires an App ID and App Certificate on the backend. Browser media needs HTTPS or localhost. No real two-party/device call or third-user denial test was run.
- Cloudinary upload, Brevo email/OTP, Firebase phone verification, MongoDB-backed endpoint ownership, and production CORS were not exercised without credentials/services.
- `GET /auth/me` and protected APIs need a running backend/database; browser UI tests here do not imply those calls succeeded.
- The backend was not started during browser smoke testing because its existing `.env` was intentionally not inspected and its database/provider targets were not verified.

## Product/Legal

- Privacy and terms pages are explicit placeholders until client-approved legal copy is supplied. No healthcare/privacy compliance claim is made.
- The public site uses remote Unsplash images and Google Fonts; production CSP/network policy must permit or replace those assets.
- Patient auth tokens are stored in localStorage because the backend uses bearer tokens and has no cookie support. XSS can expose those tokens; see README.