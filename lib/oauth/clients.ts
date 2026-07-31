/**
 * OAuth client registration.
 *
 * CIMD is the primary path: client_id is an https URL that resolves to the
 * client's own metadata document, so there is nothing to register and nothing
 * to expire. Anthropic explicitly recommends it over DCR for directory traffic,
 * because DCR registers a new client on every fresh connection.
 *
 * DCR is retained as a fallback — other MCP clients support only DCR, and
 * 2026-07-28 keeps it for backwards compatibility while deprecating it.
 * Registrations expire so the table cannot grow without bound.
 */

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { oauthClientsTable } from '@/db/schema';
import { safeFetch } from '@/lib/oauth/ssrf-protection';

export const CIMD_CACHE_TTL_MS = 86_400_000; // 1 day
export const DCR_CLIENT_TTL_MS = 2_592_000_000; // 30 days

export interface ResolvedClient {
  uuid: string;
  client_id: string;
  /**
   * The client's own claim about what it is called. Self-asserted and never
   * verified — see lib/oauth/client-display.ts for why it is carried here
   * anyway and what has to accompany it on screen.
   */
  client_name: string | null;
  redirect_uris: string[];
  registration_type: 'cimd' | 'dcr';
}

type CimdValidation =
  | { valid: true; redirect_uris: string[]; client_name?: string; application_type: string }
  | { valid: false; reason: string };

export function isCimdClientId(clientId: string): boolean {
  return clientId.startsWith('https://');
}

export function validateCimdDocument(clientIdUrl: string, doc: unknown): CimdValidation {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, reason: 'Client ID Metadata Document must be a JSON object' };
  }
  const record = doc as Record<string, unknown>;

  // The document must claim the URL it was served from. Without this check any
  // host could publish a document asserting somebody else's client_id.
  if (record.client_id !== clientIdUrl) {
    return {
      valid: false,
      reason: `client_id "${String(record.client_id)}" does not match the document URL "${clientIdUrl}"`,
    };
  }

  const redirectUris = record.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return { valid: false, reason: 'redirect_uris must be a non-empty array' };
  }
  if (!redirectUris.every((u) => typeof u === 'string')) {
    return { valid: false, reason: 'redirect_uris must contain only strings' };
  }

  const applicationType =
    typeof record.application_type === 'string' ? record.application_type : 'web';
  const clientName = typeof record.client_name === 'string' ? record.client_name : undefined;

  return {
    valid: true,
    redirect_uris: redirectUris as string[],
    client_name: clientName,
    application_type: applicationType,
  };
}

/**
 * Resolves a client_id to a stored client, fetching and caching the CIMD
 * document when needed.
 *
 * SSRF: client_id is attacker-controlled — anyone can start an authorization
 * request with any client_id — and resolving it makes the server fetch that
 * URL. So the fetch goes through safeFetch, which rejects private, loopback,
 * link-local and reserved destinations and re-validates every redirect hop.
 * Reusing the shared guard rather than writing another host check keeps this
 * on the same code path as the rest of the app; a fourth independent copy is
 * how the previous SSRF advisory happened.
 *
 * fetchImpl is injectable so tests never touch the network. It defaults to
 * safeFetch, so a caller has to opt *out* of protection rather than in.
 */
export async function resolveClient(
  clientId: string,
  issuer: string,
  fetchImpl: typeof fetch = safeFetch as unknown as typeof fetch
): Promise<ResolvedClient | undefined> {
  const existing = await db
    .select()
    .from(oauthClientsTable)
    .where(and(eq(oauthClientsTable.client_id, clientId), eq(oauthClientsTable.issuer, issuer)))
    .limit(1);

  const cached = existing[0];

  // A DCR registration carries an expiry precisely so the table cannot grow
  // without bound; returning an expired one would make that TTL decorative.
  // CIMD rows have no expiry — the document is re-fetched instead when the
  // cache goes stale.
  const dcrExpired =
    cached?.registration_type === 'dcr' &&
    cached.expires_at !== null &&
    cached.expires_at.getTime() <= Date.now();

  const cimdFresh =
    cached?.metadata_fetched_at &&
    Date.now() - cached.metadata_fetched_at.getTime() < CIMD_CACHE_TTL_MS;

  if (cached && !dcrExpired && (cached.registration_type === 'dcr' || cimdFresh)) {
    return {
      uuid: cached.uuid,
      client_id: cached.client_id,
      client_name: cached.client_name,
      redirect_uris: cached.redirect_uris,
      registration_type: cached.registration_type as 'cimd' | 'dcr',
    };
  }

  // An expired DCR client cannot be refreshed — there is no document to
  // re-fetch, only a registration that has lapsed. The caller must register
  // again.
  if (dcrExpired) return undefined;

  if (!isCimdClientId(clientId)) return undefined;

  // Anthropic allows 10 s for the whole discovery step, so the fetch is bounded
  // well inside that rather than inheriting the default timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  let document: unknown;
  try {
    const response = await fetchImpl(clientId, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return undefined;
    document = await response.json();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }

  const validation = validateCimdDocument(clientId, document);
  if (!validation.valid) return undefined;

  const values = {
    client_id: clientId,
    issuer,
    registration_type: 'cimd' as const,
    client_name: validation.client_name ?? null,
    redirect_uris: validation.redirect_uris,
    application_type: validation.application_type,
    token_endpoint_auth_method: 'none',
    metadata_fetched_at: new Date(),
  };

  if (cached) {
    await db.update(oauthClientsTable).set(values).where(eq(oauthClientsTable.uuid, cached.uuid));
    return {
      uuid: cached.uuid,
      client_id: clientId,
      client_name: values.client_name,
      redirect_uris: validation.redirect_uris,
      registration_type: 'cimd',
    };
  }

  const inserted = await db.insert(oauthClientsTable).values(values).returning();
  return {
    uuid: inserted[0].uuid,
    client_id: clientId,
    client_name: values.client_name,
    redirect_uris: validation.redirect_uris,
    registration_type: 'cimd',
  };
}
