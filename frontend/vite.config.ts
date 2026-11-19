import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Never inline assets as data: URLs — the production Content-Security-Policy (font-src 'self') forbids it.
  build: { assetsInlineLimit: 0 },
  server: {
    port: 5173,
    // Backend (FastAPI) runs on :8000 in dev; same-origin in production (served by the container).
    proxy: { '/api': 'http://localhost:8000' },
  },
})
