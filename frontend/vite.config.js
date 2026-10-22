import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
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
  test: { environment: 'jsdom' },
})
