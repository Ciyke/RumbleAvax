import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Single build, served on two custom domains from one Cloudflare Pages project:
//
//   hunt.playrumble.xyz  → the ingredient hunt
//   bet.playrumble.xyz   → the predictions market
//
// Pages serves identical content to both, so the app picks which one to render
// from window.location.hostname at runtime (see src/main.jsx). The /hunt and
// /bet paths do the same thing, which is what makes local dev and previews work
// where there is only ever one hostname.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // SPA: one entry, routed client-side. A 404 rewrite in public/_redirects
    // sends every unknown path back to index.html.
    rollupOptions: {
      output: {
        manualChunks: {
          ethers: ['ethers'],
        },
      },
    },
  },
})
