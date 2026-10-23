import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

const securityHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self)',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; connect-src 'self' https://drnutrident-backend-wj1n.onrender.com https://*.razorpay.com https://*.agora.io https://*.agoralabs.com wss://drnutrident-backend-wj1n.onrender.com wss://*.agora.io wss://*.agoralabs.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; img-src 'self' data: blob: https://res.cloudinary.com; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none';",
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    headers: securityHeaders,
    proxy: {
      '/api': {
        target: 'https://drnutrident-backend-wj1n.onrender.com',
        changeOrigin: true,
        secure: true,
      },
      '/socket.io': {
        target: 'https://drnutrident-backend-wj1n.onrender.com',
        changeOrigin: true,
        ws: true,
        secure: true,
      },
    },
  },
  preview: {
    port: 3000,
    headers: securityHeaders,
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
  },
})
