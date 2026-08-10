import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Regression tests for issue #172.
 *
 * StreamableHTTPWrapper wraps the MCP SDK transport with a custom fetch that
 * captures the `Mcp-Session-Id` response header. The wrapper used to pass this
 * fetch to StreamableHTTPClientTransport under the key `fetchImplementation`,
 * but the SDK reads it under `fetch` (StreamableHTTPClientTransportOptions.fetch).
 * As a result the wrapper's fetch was never invoked and session capture never ran.
 *
 * These tests pin the SDK contract (`fetch`, not `fetchImplementation`) and verify
 * the session-capture behaviour end to end.
 */

// Shared holders — must be created via vi.hoisted so the vi.mock factories below
// (which are hoisted to the top of the module) can reference them safely.
const sdk = vi.hoisted(() => ({ capturedOptions: undefined as any }));

const sessionMock = vi.hoisted(() => ({
  getLatestSession: vi.fn().mockResolvedValue(null),
  getSession: vi.fn().mockResolvedValue(null),
  createSession: vi.fn().mockResolvedValue(undefined),
  updateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: unknown) => void;
    constructor(_url: URL, options: unknown) {
      sdk.capturedOptions = options;
    }
    start = vi.fn().mockResolvedValue(undefined);
    send = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('@/lib/mcp/sessions/SessionManager', () => ({
  getSessionManager: () => sessionMock,
  SessionManager: class {},
}));

vi.mock('@/lib/mcp/metrics', () => ({
  categorizeError: () => 'unknown',
  mcpTransportConnectionDuration: { observe: vi.fn() },
  mcpTransportConnectionFailures: { inc: vi.fn() },
}));

vi.mock('@/lib/mcp/oauth/OAuthStateManager', () => ({
  oauthStateManager: { createOAuthSession: vi.fn().mockResolvedValue('state') },
}));

import { StreamableHTTPWrapper } from '@/lib/mcp/transports/StreamableHTTPWrapper';

const SERVER_UUID = 'server-1';
const PROFILE_UUID = 'profile-1';
const ENDPOINT = 'https://example.com/mcp';

describe('StreamableHTTPWrapper (issue #172)', () => {
  beforeEach(() => {
    sdk.capturedOptions = undefined;
    vi.clearAllMocks();
    sessionMock.getLatestSession.mockResolvedValue(null);
    sessionMock.getSession.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes the custom fetch under the SDK `fetch` key, not `fetchImplementation`', async () => {
    await StreamableHTTPWrapper.create(
      new URL(ENDPOINT),
      { timeout: 30000 },
      SERVER_UUID,
      PROFILE_UUID
    );

    expect(sdk.capturedOptions).toBeDefined();
    // The SDK contract: the wrapping fetch must be provided as `fetch`.
    expect(typeof sdk.capturedOptions.fetch).toBe('function');
    // The old, ignored key must no longer be used.
    expect(sdk.capturedOptions.fetchImplementation).toBeUndefined();
  });

  it('captures Mcp-Session-Id from a response and persists a new session', async () => {
    // The wrapper binds the underlying fetch when it is constructed, so the global
    // must be stubbed before create().
    const response = new Response('{}', {
      status: 200,
      headers: { 'Mcp-Session-Id': 'sess-abc' },
    });
    const underlyingFetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', underlyingFetch);

    await StreamableHTTPWrapper.create(new URL(ENDPOINT), {}, SERVER_UUID, PROFILE_UUID);

    const wrappedFetch = sdk.capturedOptions.fetch as typeof fetch;
    expect(typeof wrappedFetch).toBe('function');

    await wrappedFetch(ENDPOINT, { method: 'POST' });

    expect(underlyingFetch).toHaveBeenCalledTimes(1);
    // Because the wrapper's fetch actually runs, the session id is captured and stored.
    expect(sessionMock.createSession).toHaveBeenCalledWith(
      SERVER_UUID,
      PROFILE_UUID,
      'sess-abc'
    );
  });

  it('attaches a previously captured session id to outgoing requests', async () => {
    // Simulate a session already persisted for this server/profile.
    sessionMock.getLatestSession.mockResolvedValue({ id: 'existing-session' });
    const underlyingFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', underlyingFetch);

    await StreamableHTTPWrapper.create(new URL(ENDPOINT), {}, SERVER_UUID, PROFILE_UUID);

    const wrappedFetch = sdk.capturedOptions.fetch as typeof fetch;

    await wrappedFetch(ENDPOINT, { method: 'POST' });

    const [, init] = underlyingFetch.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Mcp-Session-Id')).toBe('existing-session');
  });
});
