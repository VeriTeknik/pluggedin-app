import { randomUUID } from 'crypto';

import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The four abuse checks from docs/ops/hosted-connector-deploy-checks.md §4,
 * run against a real database instead of by hand against production.
 *
 * They were the most valuable checks in that document and the only ones nobody
 * had executed, because each needs a real authorization code and live tokens.
 * Driving a full OAuth flow against production to get them is not something to
 * do casually, so they stayed unverified — which is the worst state for a check
 * to be in, since the document reads as though they had passed.
 *
 * The authorization code here comes from approveConsent(), the same server
 * action the consent screen calls. That detail is the whole point. Earlier
 * end-to-end tests in this repo inserted codes straight into the table, and a
 * CRITICAL bug in the consent path survived precisely because the step that
 * produces codes was never the step under test. Seeding the row would repeat
 * that mistake with more ceremony.
 *
 * What is mocked: getServerSession, because authentication is not what these
 * checks are about, and the CIMD document fetch, because the flow must not
 * reach the network. Everything else — the client row, the consent ticket, the
 * code, the token pair, the revocation — is real and goes through Postgres.
 *
 * Requires a database. Set INTEGRATION_DATABASE_URL to a throwaway one:
 *
 *   docker exec <pg> psql -U pluggedin -d pluggedin_dev -c 'CREATE DATABASE oauth_it;'
 *   DATABASE_URL=postgresql://…/oauth_it DATABASE_SSL=false pnpm db:migrate
 *   INTEGRATION_DATABASE_URL=postgresql://…/oauth_it pnpm test tests/integration/oauth-token-endpoint.test.ts
 *
 * Without it the suite skips rather than fails: a missing database is a missing
 * environment, not a broken control, and a red suite on every laptop would get
 * these ignored again.
 */

// Hoisted, because ESM evaluates imports before the module body: db/index.ts
// builds its connection pool the moment it is imported, and an assignment
// further down this file would land after the pool already existed. That is
// what a FATAL 28P01 from a correct URL looks like.
const { INTEGRATION_DATABASE_URL } = vi.hoisted(() => {
  const url = process.env.INTEGRATION_DATABASE_URL;
  if (url) {
    process.env.DATABASE_URL = url;
    process.env.DATABASE_SSL = 'false';
  }
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'integration-test-secret';
  process.env.NEXTAUTH_URL = 'https://plugged.in';
  return { INTEGRATION_DATABASE_URL: url };
});

const describeIfDb = INTEGRATION_DATABASE_URL ? describe : describe.skip;

const USER_ID = `it-user-${randomUUID()}`;
const CLIENT_ID = 'https://claude.ai/.well-known/oauth-client';
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
// RFC 7636 appendix B.
const CODE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CODE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

let hubUuid: string;

vi.mock('next-auth/next', () => ({
  getServerSession: () => Promise.resolve({ user: { id: USER_ID } }),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/actions/projects', () => ({
  getProjects: () => Promise.resolve([{ uuid: hubUuid, name: 'Integration Hub' }]),
}));

import { db } from '@/db';
import {
  oauthAccessTokensTable,
  oauthAuthorizationCodesTable,
  oauthClientsTable,
  oauthRefreshTokensTable,
  projectsTable,
  users,
} from '@/db/schema';
import { approveConsent } from '@/app/oauth/authorize/actions';
import { issueConsentTicket } from '@/lib/oauth/provider/consent-ticket';
import { redeemAuthorizationCode, rotateRefreshToken } from '@/lib/oauth/provider/grants';

let clientUuid: string;

/** Drives the real consent action and returns the code it minted. */
async function mintAuthorizationCode(): Promise<string> {
  const ticket = issueConsentTicket(
    {
      clientUuid,
      redirectUri: REDIRECT_URI,
      scopes: ['library:read', 'offline_access'],
      codeChallenge: CODE_CHALLENGE,
      state: 'integration',
    },
    USER_ID
  );

  const result = await approveConsent({ ticket, grantedProjectUuids: [hubUuid] });
  if (!result.success) throw new Error(`consent failed: ${result.error}`);

  const code = new URL(result.data.redirectTo).searchParams.get('code');
  if (!code) throw new Error('consent returned no code');
  return code;
}

/**
 * Backends blocked on a lock in *this* database, excluding our own connection.
 * Scoped deliberately: pg_stat_activity spans the whole cluster.
 */
async function lockWaiterPids(): Promise<number[]> {
  const rows = await db.execute(
    sql`select pid from pg_stat_activity
        where datname = current_database()
          and pid <> pg_backend_pid()
          and wait_event_type = 'Lock'
          and state = 'active'`
  );
  return (rows.rows as { pid: number }[]).map((r) => Number(r.pid));
}

async function familyCounts(familyId: string) {
  const [refresh, access] = await Promise.all([
    db.select().from(oauthRefreshTokensTable).where(eq(oauthRefreshTokensTable.family_id, familyId)),
    db.select().from(oauthAccessTokensTable).where(eq(oauthAccessTokensTable.family_id, familyId)),
  ]);
  return {
    liveRefresh: refresh.filter((r) => r.revoked_at === null).length,
    liveAccess: access.filter((r) => r.revoked_at === null).length,
    reasons: refresh.map((r) => r.revocation_reason).filter(Boolean),
  };
}

async function familyOf(refreshToken: string): Promise<string> {
  const { hashCredential } = await import('@/lib/oauth/provider/tokens');
  const rows = await db
    .select()
    .from(oauthRefreshTokensTable)
    .where(eq(oauthRefreshTokensTable.token_hash, hashCredential(refreshToken)))
    .limit(1);
  if (!rows[0]) throw new Error('refresh token not found');
  return rows[0].family_id;
}

describeIfDb('OAuth token endpoint, against a real database', () => {
  beforeAll(async () => {
    await db.insert(users).values({ id: USER_ID, email: `${USER_ID}@example.test` });
    const [hub] = await db
      .insert(projectsTable)
      .values({ name: 'Integration Hub', user_id: USER_ID })
      .returning();
    hubUuid = hub.uuid;

    const [client] = await db
      .insert(oauthClientsTable)
      .values({
        client_id: CLIENT_ID,
        issuer: 'https://plugged.in',
        registration_type: 'cimd',
        client_name: 'Claude',
        redirect_uris: [REDIRECT_URI],
        application_type: 'web',
        token_endpoint_auth_method: 'none',
        metadata_fetched_at: new Date(),
      })
      .returning();
    clientUuid = client.uuid;
  });

  afterAll(async () => {
    // projects and tokens cascade from the user where the schema says so; the
    // client row is keyed independently, so it goes explicitly.
    await db
      .delete(oauthClientsTable)
      .where(
        and(eq(oauthClientsTable.client_id, CLIENT_ID), eq(oauthClientsTable.issuer, 'https://plugged.in'))
      );
    await db.delete(projectsTable).where(eq(projectsTable.user_id, USER_ID));
    await db.delete(users).where(eq(users.id, USER_ID));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mints a code through the consent action, not by seeding the table', async () => {
    // Guards the premise of every test below. If this ever starts passing with
    // a seeded row instead, the suite has stopped testing the flow that
    // produces codes — which is exactly how the last CRITICAL bug survived.
    const code = await mintAuthorizationCode();
    expect(code).toBeTruthy();

    const result = await redeemAuthorizationCode({
      code,
      clientUuid,
      redirectUri: REDIRECT_URI,
      codeVerifier: CODE_VERIFIER,
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a second redemption of the same code', async () => {
    const code = await mintAuthorizationCode();
    const input = {
      code,
      clientUuid,
      redirectUri: REDIRECT_URI,
      codeVerifier: CODE_VERIFIER,
    };

    const first = await redeemAuthorizationCode(input);
    expect(first.ok).toBe(true);

    const second = await redeemAuthorizationCode(input);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('invalid_grant');
  });

  /**
   * Holds the row's write lock in an uncommitted transaction, runs `body`
   * against it, then releases. Promise.all is not enough to produce this race:
   * the first redemption commits before the second's SELECT lands, so the
   * second is caught by the snapshot check and the claim is never exercised —
   * removing the claim's condition left such a test green.
   *
   * Under READ COMMITTED the caller's SELECT still reads the pre-update row and
   * passes the snapshot check, then its conditional UPDATE blocks on this lock
   * until the commit and re-evaluates against the new value. That is the real
   * sequence, made deterministic.
   */
  async function whileRowIsClaimed<T>(
    claim: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>,
    body: () => Promise<T>
  ): Promise<T> {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });

    const holder = db.transaction(async (tx) => {
      await claim(tx);
      locked();
      await held;
    });

    await isLocked;

    // Who is already waiting on a lock, before the caller has been given a
    // chance to. pg_stat_activity is cluster-wide, so without this baseline any
    // unrelated backend blocked anywhere on the instance would satisfy the poll
    // below — and this test database shares its Postgres with the dev one. A
    // stale waiter over there would release the holder early and quietly
    // restore the timing assumption this replaced.
    const waitersBefore = new Set(await lockWaiterPids());

    const result = body();

    const deadline = Date.now() + 5000;
    for (;;) {
      const fresh = (await lockWaiterPids()).filter((pid) => !waitersBefore.has(pid));
      if (fresh.length > 0) break;
      if (Date.now() > deadline) throw new Error('caller never blocked on the row lock');
      await new Promise((r) => setTimeout(r, 20));
    }

    release();
    await holder;
    return result;
  }

  it('refuses a redemption whose claim loses the race', async () => {
    const code = await mintAuthorizationCode();
    const { hashCredential } = await import('@/lib/oauth/provider/tokens');
    const [row] = await db
      .select()
      .from(oauthAuthorizationCodesTable)
      .where(eq(oauthAuthorizationCodesTable.code_hash, hashCredential(code)))
      .limit(1);

    const result = await whileRowIsClaimed(
      (tx) =>
        tx
          .update(oauthAuthorizationCodesTable)
          .set({ consumed_at: new Date() })
          .where(eq(oauthAuthorizationCodesTable.uuid, row.uuid)),
      () =>
        redeemAuthorizationCode({
          code,
          clientUuid,
          redirectUri: REDIRECT_URI,
          codeVerifier: CODE_VERIFIER,
        })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_grant');
  });

  it('refuses a rotation whose claim loses the race, and kills the family', async () => {
    const code = await mintAuthorizationCode();
    const issued = await redeemAuthorizationCode({
      code,
      clientUuid,
      redirectUri: REDIRECT_URI,
      codeVerifier: CODE_VERIFIER,
    });
    if (!issued.ok) throw new Error('redemption failed');

    const { hashCredential } = await import('@/lib/oauth/provider/tokens');
    const [row] = await db
      .select()
      .from(oauthRefreshTokensTable)
      .where(eq(oauthRefreshTokensTable.token_hash, hashCredential(issued.tokens.refresh_token)))
      .limit(1);

    const result = await whileRowIsClaimed(
      (tx) =>
        tx
          .update(oauthRefreshTokensTable)
          .set({ rotated_at: new Date() })
          .where(eq(oauthRefreshTokensTable.uuid, row.uuid)),
      () => rotateRefreshToken({ refreshToken: issued.tokens.refresh_token, clientUuid })
    );

    expect(result.ok).toBe(false);
    // Losing the claim is a second use of an already-rotated token, so the
    // family must not survive it.
    const counts = await familyCounts(row.family_id);
    expect(counts.liveRefresh).toBe(0);
    expect(counts.liveAccess).toBe(0);
  });

  it('refuses a rotation for a family revoked mid-flight', async () => {
    // classifyRefreshFailure judges a snapshot taken before the transaction
    // opens, so a family revoked between that read and the claim would pass it.
    // The claim's `revoked_at IS NULL` is what catches this, and the window is
    // not incidental: revocation runs when reuse is detected, concurrently with
    // the attacker's other requests.
    const code = await mintAuthorizationCode();
    const issued = await redeemAuthorizationCode({
      code,
      clientUuid,
      redirectUri: REDIRECT_URI,
      codeVerifier: CODE_VERIFIER,
    });
    if (!issued.ok) throw new Error('redemption failed');

    const { hashCredential } = await import('@/lib/oauth/provider/tokens');
    const [row] = await db
      .select()
      .from(oauthRefreshTokensTable)
      .where(eq(oauthRefreshTokensTable.token_hash, hashCredential(issued.tokens.refresh_token)))
      .limit(1);

    const result = await whileRowIsClaimed(
      (tx) =>
        tx
          .update(oauthRefreshTokensTable)
          .set({ revoked_at: new Date(), revocation_reason: 'revoked_by_sibling' })
          .where(eq(oauthRefreshTokensTable.uuid, row.uuid)),
      () => rotateRefreshToken({ refreshToken: issued.tokens.refresh_token, clientUuid })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.description).toBe('Refresh token revoked');

    // The original revocation reason must survive: re-revoking here would
    // overwrite the record of why the family actually died.
    const [after] = await db
      .select()
      .from(oauthRefreshTokensTable)
      .where(eq(oauthRefreshTokensTable.uuid, row.uuid))
      .limit(1);
    expect(after.revocation_reason).toBe('revoked_by_sibling');
  });

  it('kills both token tables when a refresh token is replayed', async () => {
    const code = await mintAuthorizationCode();
    const issued = await redeemAuthorizationCode({
      code,
      clientUuid,
      redirectUri: REDIRECT_URI,
      codeVerifier: CODE_VERIFIER,
    });
    if (!issued.ok) throw new Error('redemption failed');

    const original = issued.tokens.refresh_token;
    const familyId = await familyOf(original);

    const rotated = await rotateRefreshToken({ refreshToken: original, clientUuid });
    expect(rotated.ok).toBe(true);

    // The replay.
    const replay = await rotateRefreshToken({ refreshToken: original, clientUuid });
    expect(replay.ok).toBe(false);

    const counts = await familyCounts(familyId);
    // Counting only live refresh rows would pass while access tokens stayed
    // valid for another hour. That gap was a real finding here.
    expect(counts.liveRefresh).toBe(0);
    expect(counts.liveAccess).toBe(0);
    expect(counts.reasons).toContain('refresh_token_reuse_detected');
  });

  it('kills the family when a refresh token arrives from the wrong client', async () => {
    const [otherClient] = await db
      .insert(oauthClientsTable)
      .values({
        client_id: 'https://other.example/.well-known/oauth-client',
        issuer: 'https://plugged.in',
        registration_type: 'cimd',
        redirect_uris: ['https://other.example/cb'],
        application_type: 'web',
        token_endpoint_auth_method: 'none',
        metadata_fetched_at: new Date(),
      })
      .returning();

    try {
      const code = await mintAuthorizationCode();
      const issued = await redeemAuthorizationCode({
        code,
        clientUuid,
        redirectUri: REDIRECT_URI,
        codeVerifier: CODE_VERIFIER,
      });
      if (!issued.ok) throw new Error('redemption failed');

      const familyId = await familyOf(issued.tokens.refresh_token);

      const result = await rotateRefreshToken({
        refreshToken: issued.tokens.refresh_token,
        clientUuid: otherClient.uuid,
      });
      expect(result.ok).toBe(false);

      const counts = await familyCounts(familyId);
      expect(counts.liveRefresh).toBe(0);
      expect(counts.liveAccess).toBe(0);
      expect(counts.reasons).toContain('refresh_token_wrong_client');
    } finally {
      await db.delete(oauthClientsTable).where(eq(oauthClientsTable.uuid, otherClient.uuid));
    }
  });

  it('answers a wrong-client token exactly as it answers an invented one', async () => {
    const [otherClient] = await db
      .insert(oauthClientsTable)
      .values({
        client_id: 'https://third.example/.well-known/oauth-client',
        issuer: 'https://plugged.in',
        registration_type: 'cimd',
        redirect_uris: ['https://third.example/cb'],
        application_type: 'web',
        token_endpoint_auth_method: 'none',
        metadata_fetched_at: new Date(),
      })
      .returning();

    try {
      const code = await mintAuthorizationCode();
      const issued = await redeemAuthorizationCode({
        code,
        clientUuid,
        redirectUri: REDIRECT_URI,
        codeVerifier: CODE_VERIFIER,
      });
      if (!issued.ok) throw new Error('redemption failed');

      const real = await rotateRefreshToken({
        refreshToken: issued.tokens.refresh_token,
        clientUuid: otherClient.uuid,
      });
      const invented = await rotateRefreshToken({
        refreshToken: 'this-token-was-never-issued',
        clientUuid: otherClient.uuid,
      });

      // Different wording would sort real tokens from invented ones without
      // redeeming any of them.
      expect(real).toEqual(invented);
    } finally {
      await db.delete(oauthClientsTable).where(eq(oauthClientsTable.uuid, otherClient.uuid));
    }
  });
});
