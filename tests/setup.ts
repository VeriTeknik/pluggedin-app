/**
 * Vitest test setup file
 * Runs before all tests
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// These fixtures execute server code outside Next's react-server condition.
// Next's build, not Vitest's DOM environment, enforces the client import boundary.
vi.mock('server-only', () => ({}));

// Mock environment variables for tests (NODE_ENV is already set by Vitest)
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
