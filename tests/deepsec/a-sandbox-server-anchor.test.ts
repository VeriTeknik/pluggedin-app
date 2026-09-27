// @vitest-environment node
/**
 * A server's own directory (<store>/servers/<uuid>) is bind-mounted writable
 * into its sandbox, so its child can replace anything inside it with a symlink.
 * Paths the host then uses from that directory — the sandbox's bind sources
 * above all, since bubblewrap resolves them on the host — must not follow such
 * a link out of that one server's directory, including into a sibling server's
 * directory elsewhere in the shared store.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ATTACKER = '11111111-1111-4111-8111-111111111111';
const VICTIM = '22222222-2222-4222-8222-222222222222';

let store: string;
const realPlatform = process.platform;

async function loadWrapper() {
  vi.stubEnv('MCP_PACKAGE_STORE_DIR', store);
  vi.resetModules();
  return import('@/lib/mcp/client-wrapper');
}

const server = (uuid: string): any => ({
  uuid,
  name: 'probe',
  type: 'STDIO',
  command: 'node',
  args: ['server.js'],
  env: {},
});

beforeEach(() => {
  store = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a-anchor-')));
  fs.mkdirSync(path.join(store, 'servers', ATTACKER), { recursive: true });
  fs.mkdirSync(path.join(store, 'servers', VICTIM, 'workspace'), { recursive: true });
  fs.mkdirSync(path.join(store, 'servers', VICTIM, 'oauth'), { recursive: true });
  Object.defineProperty(process, 'platform', { value: 'linux' });
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
  vi.unstubAllEnvs();
  fs.rmSync(store, { recursive: true, force: true });
});

describe('bubblewrap bind sources stay inside the server directory', () => {
  it('refuses a workspace that is a symlink into another server', async () => {
    fs.symlinkSync(path.join(store, 'servers', VICTIM, 'workspace'), path.join(store, 'servers', ATTACKER, 'workspace'));
    const { createBubblewrapConfig } = await loadWrapper();

    expect(() => createBubblewrapConfig(server(ATTACKER))).toThrow(/escapes base directory/);
  });

  it('does not re-bind directories that already sit inside the bound workspace', async () => {
    // With the default layout HOME is the workspace; binding its own
    // subdirectories again adds nothing, except a host-side symlink follow of
    // a path the child controls.
    const { createBubblewrapConfig } = await loadWrapper();
    const workspace = path.join(store, 'servers', ATTACKER, 'workspace');

    const cfg = createBubblewrapConfig(server(ATTACKER))!;

    const sources = cfg.args.filter((_arg, i) => /^--(ro-)?bind(-try)?$/.test(cfg.args[i - 1] ?? ''));
    for (const source of sources) {
      expect(source.startsWith(`${workspace}/`)).toBe(false);
    }
  });

  it('still binds the workspace and the server directory', async () => {
    const { createBubblewrapConfig } = await loadWrapper();

    const cfg = createBubblewrapConfig(server(ATTACKER))!;

    expect(cfg.args).toContain(path.join(store, 'servers', ATTACKER, 'workspace'));
    expect(cfg.args).toContain(path.join(store, 'servers', ATTACKER));
  });
});

describe('firejail whitelists stay inside the server directory', () => {
  it('refuses an oauth directory that is a symlink into another server', async () => {
    fs.symlinkSync(path.join(store, 'servers', VICTIM, 'oauth'), path.join(store, 'servers', ATTACKER, 'oauth'));
    const { createFirejailConfig } = await loadWrapper();

    expect(() => createFirejailConfig(server(ATTACKER))).toThrow(/escapes base directory/);
  });
});
