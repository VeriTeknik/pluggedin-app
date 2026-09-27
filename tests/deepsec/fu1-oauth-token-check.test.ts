// @vitest-environment node
/**
 * checkMcpRemoteOAuthCompletion looks for mcp-remote token files under
 * `<store>/servers/<uuid>/oauth/.mcp-auth` and, when it finds one, marks the
 * server authenticated. That `oauth` directory is bind-mounted writable into the
 * server's own sandbox, so the child can make `.mcp-auth` a symlink to another
 * server's. The link never leaves the store, so a store-anchored path check
 * accepted it and reported the other tenant's tokens as this server's.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const ATTACKER = '11111111-1111-4111-8111-111111111111';
const VICTIM = '22222222-2222-4222-8222-222222222222';

const m = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'attacker' } }) }));
vi.mock('@/db', () => {
  const chain: any = {};
  for (const method of ['select', 'from', 'leftJoin', 'innerJoin', 'where']) {
    chain[method] = () => chain;
  }
  chain.limit = async () => [
    {
      server: {
        uuid: '11111111-1111-4111-8111-111111111111',
        name: 'probe',
        args: ['-y', 'mcp-remote', 'https://mcp.example.com/sse'],
        config: {},
      },
      profile: { uuid: 'p' },
      project: { user_id: 'attacker' },
    },
  ];
  return {
    db: {
      select: () => chain,
      update: (...a: unknown[]) => {
        m.update(...a);
        return { set: () => ({ where: async () => undefined }) };
      },
    },
  };
});

let store: string;

function writeVictimTokens(): string {
  const victimAuth = path.join(store, 'servers', VICTIM, 'oauth', '.mcp-auth');
  fs.mkdirSync(path.join(victimAuth, 'probe'), { recursive: true });
  fs.writeFileSync(path.join(victimAuth, 'probe', 'x_tokens.json'), '{"access_token":"victim"}');
  return victimAuth;
}

beforeEach(() => {
  vi.clearAllMocks();
  store = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fu1-oauth-check-')));
  vi.stubEnv('MCP_PACKAGE_STORE_DIR', store);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(store, { recursive: true, force: true });
});

it("does not count another server's tokens reached through a symlinked .mcp-auth", async () => {
  const victimAuth = writeVictimTokens();
  const attackerOauth = path.join(store, 'servers', ATTACKER, 'oauth');
  fs.mkdirSync(attackerOauth, { recursive: true });
  fs.symlinkSync(victimAuth, path.join(attackerOauth, '.mcp-auth'));

  const { checkMcpRemoteOAuthCompletion } = await import('@/app/actions/check-mcp-remote-oauth');
  const result = await checkMcpRemoteOAuthCompletion(ATTACKER);

  expect(result.isAuthenticated).toBe(false);
  expect(m.update).not.toHaveBeenCalled();
});

it('still finds tokens in the server’s own directory', async () => {
  const ownAuth = path.join(store, 'servers', ATTACKER, 'oauth', '.mcp-auth', 'probe');
  fs.mkdirSync(ownAuth, { recursive: true });
  fs.writeFileSync(path.join(ownAuth, 'x_tokens.json'), '{"access_token":"own"}');

  const { checkMcpRemoteOAuthCompletion } = await import('@/app/actions/check-mcp-remote-oauth');
  const result = await checkMcpRemoteOAuthCompletion(ATTACKER);

  expect(result).toEqual({ success: true, isAuthenticated: true });
  expect(m.update).toHaveBeenCalledTimes(1);
});
