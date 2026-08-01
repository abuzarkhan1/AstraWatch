import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // ── Catalog (Collector service) — must come before generic /api/v1 ──
      '/api/v1/catalog': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // ── Billing (Payment Service) ──
      '/api/v1/billing': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      // ── All other /api/v1/* → Orchestrator (auth, incidents, healing, slo, alerting) ──
      '/api/v1': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      // ── Analyzer anomaly/predict/root-cause endpoints ──
      '/v1/anomaly': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/v1/predict': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // ── Collector metrics query & health ──
      '/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // ── Realtime WebSocket gateway ──
      '/ws': {
        target: 'http://localhost:8084',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})

