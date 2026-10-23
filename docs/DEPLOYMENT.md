# Deployment Guide

This guide covers deployment procedures for both the DrNutrident backend (Render) and frontend (Vercel, Netlify, or static host).

---

## 1. Frontend Deployment

The frontend is a React 18 single-page application built with Vite. It compiles to static files in `frontend/dist`.

### Build Settings
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node Version**: `22.x`

### Environment Variables
Configure the following environment variables in your hosting provider's dashboard:

| Variable | Value | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `https://drnutrident-backend-wj1n.onrender.com/api` | Base URL for REST API calls |
| `VITE_SOCKET_URL` | `https://drnutrident-backend-wj1n.onrender.com` | Socket.IO endpoint for live queue |
| `VITE_CLINIC_TIMEZONE` | `Asia/Kolkata` | Clinic operating timezone |

### SPA Fallback & Cache-Control Headers
The frontend requires SPA routing fallback (`index.html`) and strict `no-store` caching for HTML documents to prevent Back/Forward cache exposure.

#### Vercel (`frontend/vercel.json`):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }
      ]
    }
  ]
}
```

#### Netlify / Cloudflare Pages (`frontend/public/_headers`):
```
/*
  Cache-Control: no-store, no-cache, must-revalidate, max-age=0
```

---

## 2. Backend Deployment (Render)

The backend is an Express 5 + Node.js 22 service hosted on Render at `https://drnutrident-backend-wj1n.onrender.com`.

### Environment Configuration Checklist
Set the following environment variables in the Render Dashboard (**Environment** tab):

- `NODE_ENV=production`
- `PORT=10000`
- `MONGO_URI=<your_mongodb_connection_string>`
- `JWT_SECRET=<minimum_32_random_characters>`
- `JWT_REFRESH_SECRET=<different_minimum_32_random_characters>`
- `JWT_EXPIRES_IN=15m`
- `JWT_REFRESH_EXPIRES_IN=7d`
- `CORS_ORIGINS=https://drnutrident.com,https://drnutrident.vercel.app` (your frontend production domain)
- `TRUST_PROXY=1`
- `CLINIC_TIMEZONE=Asia/Kolkata`
- `RAZORPAY_KEY_ID=<your_key_id>`
- `RAZORPAY_KEY_SECRET=<your_key_secret>`
- `RAZORPAY_WEBHOOK_SECRET=<your_webhook_secret>`
- `CLOUDINARY_CLOUD_NAME=<your_cloud_name>`
- `CLOUDINARY_API_KEY=<your_api_key>`
- `CLOUDINARY_API_SECRET=<your_api_secret>`
- `BREVO_API_KEY=<your_brevo_api_key>`
- `EMAIL_FROM=care@drnutrident.com`
- `AGORA_APP_ID=<your_agora_app_id>`
- `AGORA_APP_CERTIFICATE=<your_agora_app_certificate>`

> [!CAUTION]
> In production, `backend/src/config/validateEnv.js` will prevent the server from starting if `JWT_SECRET` and `JWT_REFRESH_SECRET` are identical or less than 32 characters long.

### Post-Deployment Verification
Once Render finishes deploying:
1. Verify health check: `curl -I https://drnutrident-backend-wj1n.onrender.com/api/clinic-settings` -> `HTTP/2 200` with `Cache-Control: no-store`.
2. Verify primary dentist endpoint: `curl https://drnutrident-backend-wj1n.onrender.com/api/dentists/primary` -> returns chief clinician profile.
3. Test login and token revocation via the frontend web portal.