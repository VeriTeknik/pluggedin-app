/**
 * GET /api/analyze-repository attached the server's GITHUB_PAT to a
 * caller-chosen owner/repo and returned the parsed claude_desktop_config.json /
 * mcp.json — with env values — to anyone, signed in or not. With a PAT that can
 * read private repositories, that is anonymous private-repo disclosure.
 *
 * The route now requires a session and only analyses repositories whose GitHub
 * metadata says they are public.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  fetch: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => m.session }));
vi.mock('@/lib/rate-limiter', () => ({
  RateLimiters: { api: async () => ({ allowed: true, limit: 60, remaining: 59, reset: Date.now() + 60_000 }) },
}));

const SECRET_CONFIG = {
  mcpServers: { srv: { command: 'npx', args: ['srv'], env: { API_KEY: 'sk-private-value' } } },
};

function b64(v: unknown) {
  return Buffer.from(JSON.stringify(v)).toString('base64');
}

function githubResponder(repoMeta: Record<string, unknown>) {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/repos\/[^/]+\/[^/]+$/.test(url)) {
      return new Response(JSON.stringify(repoMeta), { status: 200 });
    }
    if (url.includes('/contents/claude_desktop_config.json')) {
      return new Response(JSON.stringify({ content: b64(SECRET_CONFIG) }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
}

async function call(repo = 'https://github.com/acme/private-thing') {
  const { GET } = await import('@/app/api/analyze-repository/route');
  const req = new NextRequest(`http://localhost/api/analyze-repository?url=${encodeURIComponent(repo)}`);
  return GET(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GITHUB_PAT', 'server-pat-with-private-access');
  vi.stubGlobal('fetch', m.fetch);
  m.session = { user: { id: 'user-1' } };
  m.fetch.mockImplementation(githubResponder({ private: false, visibility: 'public' }));
});

describe('analyze-repository', () => {
  it('refuses anonymous callers without contacting GitHub', async () => {
    m.session = null;

    const res = await call();

    expect(res.status).toBe(401);
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it('does not read the contents of a private repository', async () => {
    m.fetch.mockImplementation(githubResponder({ private: true, visibility: 'private' }));

    const res = await call();
    const body = await res.text();

    expect(res.status).toBe(404);
    expect(body).not.toContain('sk-private-value');
    const contentCalls = m.fetch.mock.calls.filter(([u]) => String(u).includes('/contents/'));
    expect(contentCalls).toEqual([]);
  });

  it('treats "internal" or missing visibility as not public', async () => {
    for (const meta of [{ private: true, visibility: 'internal' }, {}]) {
      m.fetch.mockClear();
      m.fetch.mockImplementation(githubResponder(meta));

      const res = await call();

      expect(res.status).toBe(404);
      expect(m.fetch.mock.calls.filter(([u]) => String(u).includes('/contents/'))).toEqual([]);
    }
  });

  it('still analyses a public repository for a signed-in user', async () => {
    const res = await call('https://github.com/acme/public-thing');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.mcpConfig).toEqual(SECRET_CONFIG);
  });
});
