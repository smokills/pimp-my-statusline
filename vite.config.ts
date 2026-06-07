/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is '/' because the site is served at the apex of a custom domain
// (pimpmystatusline.dev). It was '/pimp-my-statusline/' while on the GitHub
// Pages project path.
export default defineConfig({
  base: '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Parity tests spawn bash/python3/node; give them room.
    testTimeout: 30_000,
  },
})
