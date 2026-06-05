/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub Pages project path. If the site ever moves to a
// user page or a custom domain, change this to '/'.
export default defineConfig({
  base: '/pimp-my-statusline/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Parity tests spawn bash/python3/node; give them room.
    testTimeout: 30_000,
  },
})
