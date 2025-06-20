import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/demo.test.ts', 'tests/actions/social-real.test.ts'],
    exclude: [
      'node_modules', 
      '.next', 
      'dist',
      'tests/actions/auth.test.ts',
      'tests/actions/mcp-servers.test.ts', 
      'tests/actions/social.test.ts',
      'tests/api/tools-current.test.ts',
      'tests/api/tools-discover.test.ts',
      'tests/api/tools.test.ts',
      'tests/auth/oauth-linking.test.ts'
    ],
    testTimeout: 10000,
    hookTimeout: 10000,
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  define: {
    'process.env.NODE_ENV': '"test"',
  },
});
