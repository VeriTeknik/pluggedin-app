// @vitest-environment node
/**
 * Under bubblewrap, UV_CACHE_DIR and PNPM_STORE_DIR are forced into the
 * server's own <store>/servers/<uuid>/workspace, so no server shares a package
 * cache another can poison. By default that workspace is HOME and bound
 * writable where it is. With FIREJAIL_USER_HOME set it is bound at HOME's path
 * instead, so its own path is only visible through the read-only server
 * directory — and every install that touched the cache failed with EROFS.
 *
 * Checked on the arguments: for each cache path, the mount that decides it
 * (the last bind whose destination contains it) must be writable and backed by
 * this server's own directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/mcp/sandbox-launcher', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp/sandbox-launcher')>()),
  resolveSandboxLauncher: (name: string) => `/usr/bin/${name}`,
}));

const UUID = '11111111-1111-4111-8111-111111111111';
const realPlatform = process.platform;
let store: string;

beforeEach(() => {
  store = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r2b-cache-')));
  Object.defineProperty(process, 'platform', { value: 'linux' });
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
  vi.unstubAllEnvs();
  fs.rmSync(store, { recursive: true, force: true });
});

async function build(env: Record<string, string>) {
  vi.stubEnv('MCP_PACKAGE_STORE_DIR', store);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { createBubblewrapConfig } = await import('@/lib/mcp/client-wrapper');
  return createBubblewrapConfig({
    uuid: UUID,
    name: 'probe',
    type: 'STDIO',
    command: 'node',
    args: ['server.js'],
    env: {},
  } as any)!;
}

type Mount = { flag: string; source: string; dest: string };

function mounts(args: string[]): Mount[] {
  const result: Mount[] = [];
  const separator = args.indexOf('--');
  for (let i = 0; i < (separator === -1 ? args.length : separator); i++) {
    if (['--bind', '--ro-bind', '--bind-try', '--ro-bind-try'].includes(args[i])) {
      result.push({ flag: args[i], source: args[i + 1], dest: args[i + 2] });
      i += 2;
    }
  }
  return result;
}

const within = (child: string, parent: string) => child === parent || child.startsWith(`${parent}/`);

/** The mount that decides `target`, and where on the host `target` then lives. */
function resolve(args: string[], target: string) {
  const decisive = mounts(args).filter((mount) => within(target, mount.dest)).at(-1);
  if (!decisive) return null;
  return { ...decisive, hostPath: path.join(decisive.source, path.relative(decisive.dest, target)) };
}

function expectPrivateAndWritable(cfg: { args: string[]; env: Record<string, string> }) {
  const own = path.join(store, 'servers', UUID);
  for (const name of ['UV_CACHE_DIR', 'PNPM_STORE_DIR']) {
    const target = cfg.env[name];
    const decided = resolve(cfg.args, target);
    expect(decided, name).not.toBeNull();
    // Writable: an --ro-bind here is exactly the EROFS.
    expect(decided!.flag, `${name} is on ${decided!.flag} ${decided!.dest}`).toBe('--bind');
    // Private: backed by this server's own directory, not a shared one.
    expect(within(decided!.hostPath, own), `${name} lives at ${decided!.hostPath}`).toBe(true);
    // And the bind source exists, or bwrap refuses to start.
    expect(fs.existsSync(decided!.source), `${decided!.source} exists`).toBe(true);
  }
}

describe('the private package caches stay writable under bubblewrap', () => {
  it('with the default layout', async () => {
    expectPrivateAndWritable(await build({}));
  });

  it('when FIREJAIL_USER_HOME moves HOME', async () => {
    expectPrivateAndWritable(await build({ FIREJAIL_USER_HOME: '/home/sandbox' }));
  });

  it('when both FIREJAIL_USER_HOME and FIREJAIL_MCP_WORKSPACE are set', async () => {
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'r2b-shared-'));
    try {
      expectPrivateAndWritable(await build({ FIREJAIL_USER_HOME: '/home/sandbox', FIREJAIL_MCP_WORKSPACE: shared }));
    } finally {
      fs.rmSync(shared, { recursive: true, force: true });
    }
  });

  it('still binds the server directory itself read-only underneath', async () => {
    const cfg = await build({ FIREJAIL_USER_HOME: '/home/sandbox' });
    const own = path.join(store, 'servers', UUID);
    expect(resolve(cfg.args, path.join(own, 'uv'))!.flag).toBe('--ro-bind');
  });
});
