# DrNutrident — Deployment Checklist & Runbook (docs/DEPLOY.md)

This runbook guides deploying the DrNutrident platform to **Render** (Backend API + WebSockets) and **Vercel** (Frontend SPA).

---

## 1. Secrets & Credentials Policy

> [!CAUTION]
> **MANDATORY CREDENTIAL ROTATION**:
> Live credentials previously located in uncommitted `.env` files must be rotated immediately by the clinic owner.
> - Generate new JWT and OTP secrets.
> - Rotate Brevo, Cloudinary, and Razorpay API keys.
> - Configure secrets exclusively in Render and Vercel Environment Settings.
> - Never commit `.env` files to git (`.gitignore` enforces this).

---

## 2. Render Deployment (Backend Service)

### Service Specifications
- **Service Type**: Web Service
- **Environment**: Node
- **Build Command**: `cd backend && npm install`
- **Start Command**: `cd backend && npm start`
- **Health Check Path**: `/api/health`
- **Node Version**: `>=22.12.0` (set in `package.json` engines)

### Environment Variable Matrix (Render Dashboard)

| Variable | Recommended Value / Notes |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `5000` (or leave default if managed by Render) |
| `TRUST_PROXY` | `1` *(Mandatory for Render proxy IP resolution)* |
| `CORS_ORIGINS` | `https://your-frontend-app.vercel.app` *(Exact Vercel scheme & domain, no trailing slash)* |
| `CLIENT_URL` | `https://your-frontend-app.vercel.app` |
| `MONGO_URI` | `mongodb+srv://<user>:<password>@cluster.mongodb.net/drnutrident?retryWrites=true&w=majority` *(Ensure MongoDB Atlas Network Access allows `0.0.0.0/0` or Render outbound IPs)* |
| `JWT_SECRET` | 64-byte random string: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Distinct 64-byte random string |
| `OTP_SECRET` | At least 32-byte random string |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `BCRYPT_SALT_ROUNDS` | `10` |
| `CLOUDINARY_CLOUD_NAME` | Exact lowercase Cloud Name from Cloudinary dashboard *(case-sensitive)* |
| `CLOUDINARY_API_KEY` | Cloudinary API Key |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret |
| `BREVO_API_KEY` | Brevo v3 SMTP API Key |
| `EMAIL_FROM_ADDRESS` | Verified sender email in Brevo *(e.g., info@drnutrident.com)* |
| `EMAIL_FROM_NAME` | `DrNutrident Clinic` |
| `RAZORPAY_KEY_ID` | `rzp_test_...` or live key |
| `RAZORPAY_KEY_SECRET` | Razorpay Key Secret |
| `RAZORPAY_WEBHOOK_SECRET`| Razorpay Webhook Signing Secret |
| `AGORA_APP_ID` | Agora App ID from Agora Console |
| `AGORA_APP_CERTIFICATE` | Agora App Certificate |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Base64-encoded Firebase Service Account JSON |
| `CLINIC_TIMEZONE` | `Asia/Kolkata` |
| `SINGLE_DENTIST_MODE` | `true` |
| `PENDING_APPOINTMENT_TTL_MINUTES` | `15` |
| `VIDEO_JOIN_EARLY_MINUTES` | `15` |
| `VIDEO_JOIN_LATE_MINUTES` | `30` |
| `ADMIN_EMAIL` | Admin account email *(e.g. admin@drnutrident.com)* |
| `ADMIN_PASSWORD` | Strong password for initial admin seed |
| `ADMIN_PHONE` | Valid 10-digit phone number |
| `ADMIN_NAME` | Clinic Administrator |
| `DOCTOR_EMAIL` | `siddheshvpatil02@gmail.com` |
| `DOCTOR_PASSWORD` | Doctor login password *(must be changed after initial setup)* |
| `DOCTOR_PHONE` | Real doctor mobile phone number |
| `DOCTOR_NAME` | `Dr. Siddhesh Patil` |
| `DOCTOR_SPECIALIZATION` | `Chief Dental Surgeon & Implantologist` |
| `DOCTOR_QUALIFICATIONS` | `BDS, MDS` |
| `DOCTOR_EXPERIENCE_YEARS`| `10` |
| `DOCTOR_CONSULTATION_FEE`| `500` |

### Keep-Alive Pinger (Render Free Tier)
To prevent cold start delays (30–60s spin-up time), set up an external pinger (e.g., [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org)):
- **Endpoint**: `https://<your-render-service>.onrender.com/api/health`
- **Interval**: Every 5 to 10 minutes
- **Method**: HTTP `GET`

---

## 3. Vercel Deployment (Frontend SPA)

### Project Settings
- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Environment Variables (Vercel Project Settings)

| Variable | Value |
| :--- | :--- |
| `VITE_API_BASE_URL` | `https://<your-render-service>.onrender.com/api` |
| `VITE_SOCKET_URL` | `https://<your-render-service>.onrender.com` |
| `VITE_CLINIC_TIMEZONE` | `Asia/Kolkata` |

### Cloudinary Security Settings (Owner Action Required for PDF Delivery)
> [!IMPORTANT]
> By default, new Cloudinary accounts restrict direct delivery of PDFs and ZIP archives.
> 1. Log into your [Cloudinary Console](https://console.cloudinary.com/).
> 2. Navigate to **Settings** (gear icon) -> **Security**.
> 3. Under **PDF and ZIP files delivery**, ensure the restriction is disabled (allow delivery of PDF files).
> 4. In the DrNutrident portal, navigate to **Admin -> System status** and verify that Uploads are indicated as **Operational**.

### Content Security Policy Alignment (`vercel.json`)
Verify that `frontend/vercel.json` includes your Render backend hostname in `connect-src` and `wss://`:
```json
"Content-Security-Policy": "default-src 'self'; script-src 'self' https://checkout.razorpay.com; connect-src 'self' https://<your-render-host>.onrender.com https://*.razorpay.com https://*.agora.io https://*.agoralabs.com wss://<your-render-host>.onrender.com wss://*.agora.io wss://*.agoralabs.com https://res.cloudinary.com https://api.cloudinary.com; frame-src 'self' blob: https://api.razorpay.com https://checkout.razorpay.com https://res.cloudinary.com; object-src 'self' blob: https://res.cloudinary.com; img-src 'self' data: blob: https://res.cloudinary.com; media-src 'self' blob: https://res.cloudinary.com; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none';"
```

---

## 4. Post-Deployment Smoke Test Protocol

Perform the following 11 tests immediately upon completing deployment:

| # | Test Scenario | Execution Steps | Expected Result |
| :---: | :--- | :--- | :--- |
| 1 | **Health Check** | `curl -i https://<render-host>/api/health` | Returns HTTP 200 with `{ "status": "ok", "uptime": ... }`. |
| 2 | **Doctor Login** | Log in with `siddheshvpatil02@gmail.com` and configured doctor password. | Accesses `/dentist` dashboard. Does NOT force-redirect to availability because default clinic hours are seeded. |
| 3 | **Admin Login** | Log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. | Accesses `/admin` overview showing single-clinic KPIs and system health status. |
| 4 | **Receptionist Login** | Log in with receptionist credentials. | Accesses `/reception` desk with live queue, appointment manager, and billing desk. |
| 5 | **Patient Registration & Verification** | Register new account at `/register`, receive OTP email via Brevo, submit 6-digit code. | User account created and verified; automatically logs into `/app`. |
| 6 | **Multi-Role Uploads (JPG, PNG, WEBP, PDF)** | Upload an X-ray (PDF) and medical record (JPG) as patient, receptionist, and doctor; upload profile photo as admin. | Upload completes without 503; image thumbnail renders immediately; PDF opens via streaming endpoint `/api/medical-records/:id/file`. |
| 7 | **Idle Tab Recovery** | Open dashboard, leave tab idle for 20 minutes, then click navigation links. | Silent refresh executes ~60s prior to access token expiry; user remains authenticated without sudden logout. |
| 8 | **Rapid Login Flood** | Attempt 25 logins with valid credentials in rapid succession. | Rate limiter skips successful requests; logins succeed without "Too many attempts" error. |
| 9 | **Online Booking & Payment** | Patient books slot on `/app/book/:dentistId`, completes Razorpay test checkout. | Appointment transitions to `status: 'confirmed'`, `paymentStatus: 'paid'`. Invoice generated automatically. |
| 10 | **Walk-in Desk & Cash Collection** | Receptionist registers walk-in patient, books in-clinic slot, creates invoice, records Cash payment. | Walk-in patient profile saved; queue updated in real-time; receipt downloadable as PDF. |
| 11 | **Video Lobby Launch** | Open video consultation 10 minutes prior to confirmed video appointment. | Agora camera & mic permission test succeeds; lobby countdown indicates ready state. |
