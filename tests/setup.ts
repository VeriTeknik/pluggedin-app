/**
 * Vitest test setup file
 * Runs before all tests
 */

import '@testing-library/jest-dom/vitest';

// Mock environment variables for tests (NODE_ENV is already set by Vitest)
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
