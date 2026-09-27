import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Login cookies were scoped to the parent domain (deepsec
 * pluggedin-app-other-session-cookie-exposure-256a1abba2).
 *
 * With NEXTAUTH_URL=https://plugged.in the session cookie carried
 * `Domain=plugged.in`, which a browser sends to every subdomain — including the
 * tenant-controlled agent hosts at {name}.is.plugged.in. Any tenant running an
 * HTTP service there received a visitor's session token and could replay it.
 *
 * The cookie is host-only now. Browsers holding the old domain-scoped copy keep
 * sending it to subdomains until it expires, so it is retired the next time
 * NextAuth writes the session.
 */

const m = vi.hoisted(() => ({ handler: vi.fn() }));

vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: () => ({}) }));
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: vi.fn() } } } }));
vi.mock('@/lib/admin-notifications', () => ({ notifyAdminsOfNewUser: vi.fn() }));
vi.mock('@/lib/welcome-emails', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('@/lib/default-project-creation', () => ({ createDefaultProject: vi.fn() }));
vi.mock('next-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-auth')>()),
  default: () => m.handler,
}));

const SESSION = '__Secure-next-auth.session-token';
const CALLBACK = '__Secure-next-auth.callback-url';

async function load(nextAuthUrl: string) {
  vi.resetModules();
  vi.stubEnv('NEXTAUTH_URL', nextAuthUrl);
  const { authOptions } = await import('@/lib/auth');
  const route = await import('@/app/api/auth/[...nextauth]/route');
  return { authOptions, route };
}

function nextAuthResponse(setCookies: string[]) {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return new Response('{"user":{"id":"u1"}}', { status: 200, headers });
}

function request(cookie: string) {
  return new Request('https://plugged.in/api/auth/session', { headers: { cookie } });
}

const ctx = { params: Promise.resolve({ nextauth: ['session'] }) };

beforeEach(() => {
  m.handler.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('session cookies are host-only', () => {
  it('does not scope the session or callback cookie to the parent domain', async () => {
    const { authOptions } = await load('https://plugged.in');

    expect(authOptions.cookies?.sessionToken?.name).toBe(SESSION);
    expect(authOptions.cookies?.sessionToken?.options).not.toHaveProperty('domain');
    expect(authOptions.cookies?.sessionToken?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(authOptions.cookies?.callbackUrl?.options).not.toHaveProperty('domain');
  });
});

describe('the legacy domain-scoped copy is retired', () => {
  it('expires the Domain=plugged.in cookies when NextAuth rewrites the session', async () => {
    const { route } = await load('https://plugged.in');
    m.handler.mockResolvedValue(
      nextAuthResponse([`${SESSION}=NEW; Path=/; HttpOnly; Secure; SameSite=Lax`])
    );

    const response = await route.GET(
      request(`${SESSION}=OLD; ${CALLBACK}=https%3A%2F%2Fplugged.in`) as never,
      ctx as never
    );
    const cookies = response.headers.getSetCookie();

    const expiry = (name: string) =>
      cookies.findIndex(
        (c) =>
          c.startsWith(`${name}=;`) &&
          /;\s*Domain=plugged\.in(;|$)/i.test(c) &&
          /;\s*Max-Age=0(;|$)/i.test(c) &&
          /;\s*Path=\/(;|$)/i.test(c) &&
          /;\s*Secure(;|$)/i.test(c)
      );
    const fresh = cookies.findIndex((c) => c.startsWith(`${SESSION}=NEW`));

    expect(expiry(SESSION)).toBeGreaterThanOrEqual(0);
    expect(expiry(CALLBACK)).toBeGreaterThanOrEqual(0);
    // Retire first, then set: a browser that conflated the two copies would
    // otherwise delete the fresh host-only session.
    expect(fresh).toBeGreaterThan(expiry(SESSION));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"user":{"id":"u1"}}');
  });

  it('retires every chunk of a chunked legacy session', async () => {
    const { route } = await load('https://plugged.in');
    m.handler.mockResolvedValue(nextAuthResponse([`${SESSION}=NEW; Path=/; HttpOnly; Secure`]));

    const response = await route.POST(
      request(`${SESSION}.0=A; ${SESSION}.1=B`) as never,
      ctx as never
    );
    const cookies = response.headers.getSetCookie();

    for (const name of [`${SESSION}.0`, `${SESSION}.1`]) {
      expect(cookies.some((c) => c.startsWith(`${name}=;`) && /Domain=plugged\.in/i.test(c))).toBe(true);
    }
  });

  it('leaves responses that do not write the session alone', async () => {
    const { route } = await load('https://plugged.in');
    m.handler.mockResolvedValue(nextAuthResponse([]));

    const response = await route.GET(request(`${SESSION}=OLD`) as never, ctx as never);

    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('adds nothing on plain-http deployments, which never set a Domain', async () => {
    const { route } = await load('http://localhost:12005');
    m.handler.mockResolvedValue(nextAuthResponse(['next-auth.session-token=NEW; Path=/; HttpOnly']));

    const response = await route.GET(request('next-auth.session-token=OLD') as never, ctx as never);

    expect(response.headers.getSetCookie()).toEqual(['next-auth.session-token=NEW; Path=/; HttpOnly']);
  });
});
