# Deployment

No frontend host is assumed. Deploy the `frontend/` build output (`frontend/dist`) to a static host configured with SPA fallback: unknown paths such as `/app/appointments` must serve `index.html`.

## Frontend

- Build: `npm run build` from `frontend/`.
- Set `VITE_API_BASE_URL` to the backend origin plus `/api`, `VITE_SOCKET_URL` to the Socket.IO origin, and `VITE_CLINIC_TIMEZONE` to the clinic timezone.
- Serve over HTTPS. Configure response-header CSP at the host; allow only the chosen backend/Socket.IO origin, Razorpay checkout (`checkout.razorpay.com` and its documented payment frames/connect origins), Agora RTC/media origins required by the selected SDK, and the chosen image/font asset origins. Avoid broad wildcards where possible; verify against current Razorpay/Agora requirements before release.
- If remote Unsplash/Google Font assets are not acceptable, replace them with approved locally hosted assets and narrow CSP accordingly.

## Backend

- Set production `CORS_ORIGINS` to the exact frontend origin(s); do not rely on localhost defaults.
- Set `TRUST_PROXY=1` only when one trusted reverse proxy sits in front of Express; configure the hosting proxy accordingly.
- Use production MongoDB, unique random JWT secrets of at least 64 random bytes, and backend-only Razorpay, Agora, Cloudinary, Brevo, and Firebase credentials.
- Set Razorpay webhook URL to `/api/payments/webhook`, verify the raw-body signature, and configure the matching webhook secret/events. Switch to live keys only after explicit clinic approval and provider checks.
- Ensure Agora token generation is enabled and the frontend uses HTTPS. Validate permission denial, reconnection, and token-renewal behavior on the deployed environment.
- Before deploying the unique queue index, check existing data for duplicate `{ dentist, date, tokenNumber }` tuples and resolve duplicates additively.
- Deploy additive schema/index changes, smoke-test health and role authorization, monitor payment/webhook and socket errors, and retain the previous backend/frontend artifacts for rollback.

## Secret Rotation and Rollback

Rotate any credentials previously exposed in source, `.env`, logs, or archives. Do not copy `.env` files into static hosting or build artifacts. Roll back frontend and backend artifacts independently; do not remove newly created documents or indexes as a rollback shortcut without assessing live data.