import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Configure base to support GitHub Pages deployments. You can override with VITE_BASE env var.
  base: process.env.VITE_BASE || '/',
})
