import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `vite preview` serves the production build with the same security headers Vercel will apply (from vercel.json),
// so CSP problems can be caught locally before deploying.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf-8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
const previewHeaders = Object.fromEntries((vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]))

const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.{ts,tsx}'] },
  preview: { port: 4173, headers: previewHeaders, proxy: { '/api': { target, changeOrigin: true, ws: true } } },
  server: { port: 5173, proxy: { '/api': { target, changeOrigin: true, ws: true } } },
})
