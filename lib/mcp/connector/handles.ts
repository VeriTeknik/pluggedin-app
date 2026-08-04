/**
 * Hub handles.
 *
 * SEP-2567 removed protocol sessions, so "the Hub I am currently working in"
 * cannot live in connection state. It travels as an argument instead, and
 * pluggedin_open_hub mints the value that later calls pass back.
 *
 * The handle is deliberately **not** a capability. Every call re-checks the Hub
 * against the set granted at consent, so a caller who invents a handle, reuses
 * somebody else's, or simply passes a raw project uuid gets exactly the same
 * answer: refused unless that Hub was granted to this token. Binding the handle
 * to the token is defence in depth and a way to keep the wire format opaque —
 * clients that never see a raw uuid cannot start depending on its shape — but
 * the authorization decision does not rest on it.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const PREFIX = 'hub';

function signingKey(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required to mint Hub handles');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function mintHubHandle(tokenUuid: string, projectUuid: string): string {
  const payload = Buffer.from(`${tokenUuid}:${projectUuid}`).toString('base64url');
  return `${PREFIX}_${payload}.${sign(payload)}`;
}

/**
 * Returns the project a handle names, or undefined. Undefined is not an error
 * on its own — callers fall back to the raw argument and let the granted-set
 * check decide, so an unreadable handle degrades to "not granted" rather than
 * to a distinct failure a caller could probe.
 */
export function readHubHandle(handle: string, tokenUuid: string): string | undefined {
  if (!handle.startsWith(`${PREFIX}_`)) return undefined;

  const [payload, signature] = handle.slice(PREFIX.length + 1).split('.');
  if (!payload || !signature) return undefined;

  const expected = Buffer.from(sign(payload), 'utf8');
  const presented = Buffer.from(signature, 'utf8');
  if (expected.length !== presented.length) return undefined;
  if (!timingSafeEqual(expected, presented)) return undefined;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }

  const separator = decoded.indexOf(':');
  if (separator < 0) return undefined;
  if (decoded.slice(0, separator) !== tokenUuid) return undefined;

  return decoded.slice(separator + 1) || undefined;
}
