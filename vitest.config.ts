import path from 'path'; // Node built-in first

import react from '@vitejs/plugin-react'; // External package
import { defineConfig } from 'vitest/config'; // External package

export default defineConfig({
  plugins: [react()], // Add if testing React components
  test: {
    globals: true, // Use global APIs like describe, it, expect
    environment: 'node', // Or 'jsdom' if testing browser-specific features
    setupFiles: [], // Add setup files if needed (e.g., './tests/setup.ts')
    // Include test files (adjust pattern if needed)
    include: ['tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    alias: {
      // Setup path aliases to match tsconfig.json
      '@/': path.resolve(__dirname, './'),
      // Add other aliases from tsconfig.json if necessary
    },
  },
});
