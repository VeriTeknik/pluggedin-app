import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers approveConsent's client lookup.
 *
 * This path was broken and no test caught it: the consent ticket carries the
 * client's internal uuid, but the code looked the client up through
 * resolveClient(), which takes the public client_id. Every consent therefore
 * failed with 'Unknown client'. The end-to-end checks missed it because they
 * inserted authorization codes directly, skipping the consent screen entirely.
 */

const clientRows: Record<string, unknown>[] = [];
const insertedCodes: Record<string, unknown>[] = [];
let lookupColumn: string | undefined;

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condition: { queryChunks?: unknown[] }) => {
          // drizzle's eq() wraps the column in an SQL object whose queryChunks
          // hold it. Reading .name off that chunk is how this test proves the
          // lookup keys on uuid rather than client_id. JSON.stringify would
          // throw here — the structure is circular.
          const column = (condition?.queryChunks ?? []).find(
            (chunk): chunk is { name: string } =>
              typeof (chunk as { name?: unknown })?.name === 'string'
          );
          lookupColumn = column?.name;
          return { limit: () => Promise.resolve(clientRows) };
        },
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertedCodes.push(v);
        return Promise.resolve([]);
      },
    }),
  },
}));

vi.mock('next-auth/next', () => ({
  getServerSession: () => Promise.resolve({ user: { id: 'user-1' } }),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/actions/projects', () => ({
  getProjects: () => Promise.resolve([{ uuid: 'hub-1', name: 'Hub One' }]),
}));

import { approveConsent } from '@/app/oauth/authorize/actions';
import { issueConsentTicket } from '@/lib/oauth/provider/consent-ticket';

const CLIENT_UUID = '11111111-1111-1111-1111-111111111111';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-for-consent-tickets';
  process.env.NEXTAUTH_URL = 'https://plugged.in';
  clientRows.length = 0;
  insertedCodes.length = 0;
  lookupColumn = undefined;
});

function ticket() {
  return issueConsentTicket({
    clientUuid: CLIENT_UUID,
    redirectUri: REDIRECT,
    scopes: ['library:read'],
    codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    state: 'xyz',
  });
}

describe('approveConsent', () => {
  it('issues a code when the ticket, Hub and redirect URI all check out', async () => {
    clientRows.push({ uuid: CLIENT_UUID, redirect_uris: [REDIRECT] });

    const result = await approveConsent({ ticket: ticket(), grantedProjectUuids: ['hub-1'] });

    expect(result.success).toBe(true);
    if (result.success) {
      const url = new URL(result.data.redirectTo);
      expect(url.searchParams.get('code')).toBeTruthy();
      expect(url.searchParams.get('state')).toBe('xyz');
      // RFC 9207 — lets the client detect an authorization-server mix-up.
      expect(url.searchParams.get('iss')).toBe('https://plugged.in');
    }
  });

  it('looks the client up by uuid, not by client_id', async () => {
    // The regression this file exists for: the ticket holds a uuid, so a lookup
    // keyed on client_id never matches and consent always fails.
    clientRows.push({ uuid: CLIENT_UUID, redirect_uris: [REDIRECT] });
    await approveConsent({ ticket: ticket(), grantedProjectUuids: ['hub-1'] });
    expect(lookupColumn).toBe('uuid');
  });

  it('refuses a Hub the user does not own', async () => {
    clientRows.push({ uuid: CLIENT_UUID, redirect_uris: [REDIRECT] });
    const result = await approveConsent({
      ticket: ticket(),
      grantedProjectUuids: ['someone-elses-hub'],
    });
    expect(result.success).toBe(false);
    expect(insertedCodes).toHaveLength(0);
  });

  it('refuses when no Hub was chosen', async () => {
    clientRows.push({ uuid: CLIENT_UUID, redirect_uris: [REDIRECT] });
    const result = await approveConsent({ ticket: ticket(), grantedProjectUuids: [] });
    expect(result.success).toBe(false);
  });

  it('refuses a tampered ticket', async () => {
    clientRows.push({ uuid: CLIENT_UUID, redirect_uris: [REDIRECT] });
    const [payload] = ticket().split('.');
    const result = await approveConsent({
      ticket: `${payload}.forged-signature`,
      grantedProjectUuids: ['hub-1'],
    });
    expect(result.success).toBe(false);
    expect(insertedCodes).toHaveLength(0);
  });

  it('refuses when the client no longer registers the redirect URI', async () => {
    clientRows.push({ uuid: CLIENT_UUID, redirect_uris: ['https://elsewhere.example/cb'] });
    const result = await approveConsent({ ticket: ticket(), grantedProjectUuids: ['hub-1'] });
    expect(result.success).toBe(false);
    expect(insertedCodes).toHaveLength(0);
  });

  it('refuses an unknown client', async () => {
    const result = await approveConsent({ ticket: ticket(), grantedProjectUuids: ['hub-1'] });
    expect(result.success).toBe(false);
  });
});
