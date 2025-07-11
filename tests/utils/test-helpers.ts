import { vi, beforeAll, afterAll, afterEach, expect } from 'vitest';
import type { Session } from 'next-auth';

// Helper to mock getAuthSession
export function mockGetAuthSession(session: Session | null = null) {
  return vi.fn().mockResolvedValue(session);
}

// Helper to wait for async operations
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to create test IDs
export function createTestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to setup common mocks
export function setupCommonMocks() {
  // Mock console methods to reduce noise in tests
  const originalConsole = { ...console };
  
  beforeAll(() => {
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
  });
  
  afterAll(() => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
  });
  
  // Mock global fetch
  global.fetch = vi.fn();
  
  // Clear all mocks after each test
  afterEach(() => {
    vi.clearAllMocks();
  });
}

// Helper to assert server action responses
export function expectSuccess<T>(result: { success: boolean; data?: T; error?: string }): asserts result is { success: true; data: T } {
  if (!result.success) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
}

export function expectError(result: { success: boolean; error?: string }): asserts result is { success: false; error: string } {
  if (result.success) {
    throw new Error('Expected error but got success');
  }
}

// Helper to create mock Request object
export function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
} = {}): Request {
  const {
    method = 'GET',
    url = 'http://localhost:3000',
    headers = {},
    body = null,
  } = options;
  
  return new Request(url, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : null,
  });
}

// Helper to create mock Response object
export function createMockResponse(
  body: any,
  init: ResponseInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    ...init,
  });
}

// Helper for testing with different user roles
export function createSessionWithRole(role: 'user' | 'admin' | 'guest' = 'user'): Session | null {
  if (role === 'guest') return null;
  
  return {
    user: {
      id: `test-${role}-id`,
      email: `${role}@example.com`,
      name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      username: `test${role}`,
      image: null,
      ...(role === 'admin' && { isAdmin: true }),
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

// Helper to test validation errors
export async function expectValidationError(
  fn: () => Promise<any>,
  expectedError: string | RegExp
) {
  try {
    await fn();
    throw new Error('Expected validation error but none was thrown');
  } catch (error) {
    if (error instanceof Error) {
      if (typeof expectedError === 'string') {
        expect(error.message).toContain(expectedError);
      } else {
        expect(error.message).toMatch(expectedError);
      }
    } else {
      throw error;
    }
  }
}