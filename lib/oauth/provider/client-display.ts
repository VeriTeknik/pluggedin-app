/**
 * How a client is named on the consent screen.
 *
 * The consent screen is where the user decides whether to trust a client, so
 * what it calls that client is a security control, not presentation. Two facts
 * shape this module:
 *
 *   - `client_name` is self-asserted. A CIMD document declares it; a DCR
 *     registration POSTs it unauthenticated. Nobody checks it against anything.
 *     Any host can publish a document naming itself "Claude".
 *   - The client_id is not self-asserted for CIMD. It is an https URL we
 *     actually fetched, and the document served there must claim that same URL
 *     as its own client_id. Its origin is therefore verified.
 *
 * So the name alone must never be the whole story. It is shown because
 * "Connect https://claude.ai/.well-known/oauth-client to Plugged.in" is a
 * worse prompt than "Connect Claude" — users cannot judge a raw URL — but it is
 * always accompanied by the origin that vouches for it, and DCR names are
 * marked unverified because no origin vouches for them at all.
 */

import type { ResolvedClient } from '@/lib/oauth/provider/clients';

export interface ClientDisplay {
  /** Safe to render. Falls back to the verified origin, then to the raw id. */
  name: string;
  /** The host whose document asserted this name. null for DCR. */
  origin: string | null;
  /** True when `name` came from the client rather than from the URL. */
  nameIsSelfAsserted: boolean;
}

const MAX_NAME_LENGTH = 64;

/**
 * Bidi overrides and isolates. A consent title is exactly where these get used:
 * a name ending in U+202E reverses everything printed after it, so "evil.org"
 * can be made to read "gro.live" and the user approves a sentence they never
 * actually read. Stripped rather than escaped, since a
 * legitimate client name has no reason to reorder the text around it.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

export function sanitizeClientName(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.length > MAX_NAME_LENGTH ? `${cleaned.slice(0, MAX_NAME_LENGTH - 1)}…` : cleaned;
}

export function describeClient(client: ResolvedClient): ClientDisplay {
  let origin: string | null = null;
  if (client.registration_type === 'cimd') {
    try {
      origin = new URL(client.client_id).host;
    } catch {
      // A cimd row whose client_id will not parse should not take the consent
      // screen down; it just loses the origin line and keeps the raw id.
      origin = null;
    }
  }

  const asserted = sanitizeClientName(client.client_name);
  if (asserted) {
    return { name: asserted, origin, nameIsSelfAsserted: true };
  }

  return { name: origin ?? client.client_id, origin, nameIsSelfAsserted: false };
}
