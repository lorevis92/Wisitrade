import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// In sviluppo locale usa "vercel dev" per avere anche le API (/api/*).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
})
