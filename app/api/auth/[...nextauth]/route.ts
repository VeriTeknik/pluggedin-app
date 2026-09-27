import NextAuth from 'next-auth';

import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

/**
 * Session cookies used to be set with `Domain=<NEXTAUTH_URL host>`, which
 * browsers send to every subdomain — tenant agents included. They are
 * host-only now, but a browser keeps the old domain-scoped copy (a separate
 * cookie with the same name) until it expires.
 *
 * So whenever NextAuth writes the session — sign-in, the /session refresh every
 * page load makes, sign-out — the domain-scoped copies the request carried are
 * expired too. They go first: the fresh host-only cookie must be the last word.
 */
function legacyCookieExpiries(request: Request, response: Response): string[] {
  const sessionName = authOptions.cookies?.sessionToken?.name;
  const callbackName = authOptions.cookies?.callbackUrl?.name;
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (!sessionName || !callbackName || !nextAuthUrl) return [];

  const isSession = (name: string) => name === sessionName || name.startsWith(`${sessionName}.`);
  const nameOf = (cookie: string) => cookie.slice(0, cookie.indexOf('=')).trim();

  if (!response.headers.getSetCookie().some((cookie) => isSession(nameOf(cookie)))) return [];

  const domain = new URL(nextAuthUrl).hostname;
  const carried = new Set((request.headers.get('cookie') ?? '').split(';').map(nameOf));
  return [...carried]
    .filter((name) => isSession(name) || name === callbackName)
    .map(
      (name) =>
        `${name}=; Domain=${domain}; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`
    );
}

async function authHandler(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> }
): Promise<Response> {
  const response: Response = await handler(request, context);
  const expiries = legacyCookieExpiries(request, response);
  if (expiries.length === 0) return response;

  const headers = new Headers();
  for (const expiry of expiries) headers.append('set-cookie', expiry);
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers.append(name, value);
  });
  for (const cookie of response.headers.getSetCookie()) headers.append('set-cookie', cookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { authHandler as GET, authHandler as POST };
