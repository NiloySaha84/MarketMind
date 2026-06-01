import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// jsdom + setup file — no tailwind plugin needed here
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
