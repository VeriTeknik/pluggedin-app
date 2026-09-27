// @vitest-environment node
/**
 * OAuthProcessManager clears and later scans `<store>/servers/<uuid>/oauth` on
 * the host — recursive delete of `.mcp-auth/<serverName>`, token files read
 * back into the server's config. That directory is writable by the server's
 * sandboxed child, which can make `oauth` a symlink to another server's
 * `oauth`. The link never leaves the store, so a store-anchored path check
 * accepted it and the host deleted (and would read) the other tenant's tokens.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  spawn: vi.fn(() => {
    throw new Error('spawn reached');
  }),
}));
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, default: { ...actual, spawn: m.spawn }, spawn: m.spawn };
});

const ATTACKER = '11111111-1111-4111-8111-111111111111';
const VICTIM = '22222222-2222-4222-8222-222222222222';

let store: string;

beforeEach(() => {
  store = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a-oauth-')));
  const victimAuth = path.join(store, 'servers', VICTIM, 'oauth', '.mcp-auth');
  fs.mkdirSync(path.join(victimAuth, 'probe'), { recursive: true });
  fs.writeFileSync(path.join(victimAuth, 'probe', 'x_tokens.json'), '{"access_token":"victim"}');
  fs.writeFileSync(path.join(victimAuth, 'tokens.json'), '{"access_token":"victim"}');
  fs.mkdirSync(path.join(store, 'servers', ATTACKER), { recursive: true });
  fs.symlinkSync(path.join(store, 'servers', VICTIM, 'oauth'), path.join(store, 'servers', ATTACKER, 'oauth'));
  vi.stubEnv('MCP_PACKAGE_STORE_DIR', store);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(store, { recursive: true, force: true });
});

it("refuses an oauth directory symlinked into another server's, leaving its tokens alone", async () => {
  const { OAuthProcessManager } = await import('@/lib/mcp/oauth-process-manager');

  const result = await new OAuthProcessManager().triggerOAuth({
    serverName: 'probe',
    serverUuid: ATTACKER,
    serverUrl: 'https://mcp.example.com/sse',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.example.com/sse'],
    env: {},
  } as any);

  expect(result.success).toBe(false);
  expect(m.spawn).not.toHaveBeenCalled();
  const victimAuth = path.join(store, 'servers', VICTIM, 'oauth', '.mcp-auth');
  expect(fs.existsSync(path.join(victimAuth, 'probe', 'x_tokens.json'))).toBe(true);
  expect(fs.existsSync(path.join(victimAuth, 'tokens.json'))).toBe(true);
});
