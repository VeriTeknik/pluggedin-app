import { vi } from 'vitest';

/**
 * Test utilities and mock helpers for consistent testing patterns
 */

// Mock successful API response
export function mockApiResponse(data: any, options: Partial<Response> = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(data)])),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    formData: vi.fn().mockResolvedValue(new FormData()),
    clone: vi.fn().mockReturnThis(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    ...options,
  } as unknown as Response;
}

// Mock error API response
export function mockApiError(message: string, status = 400) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: new Headers(),
    json: vi.fn().mockResolvedValue({ error: message }),
    text: vi.fn().mockResolvedValue(message),
    blob: vi.fn().mockResolvedValue(new Blob([message])),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    formData: vi.fn().mockResolvedValue(new FormData()),
    clone: vi.fn().mockReturnThis(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
  } as unknown as Response;
}

// Mock database query result
export function mockDbQuery(data: any) {
  return vi.fn().mockResolvedValue(data);
}

// Mock database query chain
export function mockDbChain(finalData: any) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnValue(Promise.resolve(finalData)),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(finalData),
  };
  return chain;
}

// Mock session for authentication
export function mockSession(overrides: any = {}) {
  return {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      ...overrides,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

// Mock project and profile
export function mockProjectData() {
  return {
    project: {
      uuid: 'test-project-uuid',
      user_id: 'test-user-id',
      name: 'Test Project',
      active_profile_uuid: 'test-profile-uuid',
    },
    profile: {
      uuid: 'test-profile-uuid',
      project_uuid: 'test-project-uuid',
      name: 'Test Profile',
    },
  };
}

// Setup fetch mock with predefined responses
type FetchMockHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

interface FetchMockSpec {
  statusCode: number;
  body?: any;
  headers?: Record<string, string>;
}

export function setupFetchMocks(mocks: Record<string, any>) {
  (global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
    // Find matching mock by URL pattern
    for (const [pattern, response] of Object.entries(mocks)) {
      if (url.includes(pattern)) {
        if (typeof response === 'function') {
          return Promise.resolve((response as FetchMockHandler)(url, init));
        }

        if (response && typeof response === 'object' && 'statusCode' in response) {
          const spec = response as FetchMockSpec;
          const headers = spec.headers ? new Headers(spec.headers) : undefined;
          if (spec.statusCode >= 400) {
            return Promise.resolve(
              mockApiError(
                typeof spec.body === 'string' ? spec.body : spec.body?.error || 'Error',
                spec.statusCode
              )
            );
          }

          return Promise.resolve(
            mockApiResponse(spec.body ?? {}, {
              status: spec.statusCode,
              ok: spec.statusCode >= 200 && spec.statusCode < 400,
              headers,
            })
          );
        }

        return Promise.resolve(
          response instanceof Error
            ? mockApiError(response.message)
            : mockApiResponse(response)
        );
      }
    }
    // Default response if no match
    return Promise.resolve(mockApiResponse({}));
  });
}

// Reset all mocks
export function resetAllMocks() {
  vi.clearAllMocks();
  vi.resetAllMocks();
}
