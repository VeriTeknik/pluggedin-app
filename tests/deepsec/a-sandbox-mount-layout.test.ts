// @vitest-environment node
/**
 * The whole <store>/servers/<uuid> directory was bind-mounted read-write into
 * the server's sandbox. It also holds that server's package-manager installs
 * (pnpm/, uv/, ...), which the host writes and then resolves and executes — so
 * a running server could race the host-side installer, e.g. by swapping its
 * install directory for a symlink. The server itself only needs to write its
 * workspace (HOME) and its OAuth directory (mcp-remote keeps tokens there).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const UUID = '11111111-1111-4111-8111-111111111111';

let store: string;
let serverDir: string;
const realPlatform = process.platform;

async function loadWrapper() {
  vi.stubEnv('MCP_PACKAGE_STORE_DIR', store);
  vi.resetModules();
  return import('@/lib/mcp/client-wrapper');
}

const server = (extra: Record<string, unknown> = {}): any => ({
  uuid: UUID,
  name: 'probe',
  type: 'STDIO',
  command: 'node',
  args: ['server.js'],
  env: {},
  ...extra,
});

beforeEach(() => {
  store = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a-mounts-')));
  serverDir = path.join(store, 'servers', UUID);
  fs.mkdirSync(path.join(serverDir, 'pnpm'), { recursive: true });
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
  vi.unstubAllEnvs();
  fs.rmSync(store, { recursive: true, force: true });
});

/** [flag, source, dest] for every bind-style mount, in order. */
function mounts(args: string[]): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  args.forEach((arg, i) => {
    if (/^--(ro-)?bind(-try)?$/.test(arg)) out.push([arg, args[i + 1], args[i + 2]]);
  });
  return out;
}

describe('bubblewrap mount layout', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });

  it('mounts the server directory read-only', async () => {
    const { createBubblewrapConfig } = await loadWrapper();

    const layout = mounts(createBubblewrapConfig(server())!.args);

    expect(layout).toContainEqual(['--ro-bind', serverDir, serverDir]);
    expect(layout.filter(([flag, source]) => source === serverDir && !flag.startsWith('--ro'))).toEqual([]);
  });

  it('mounts the workspace and the OAuth directory writable, on top of it', async () => {
    const { createBubblewrapConfig } = await loadWrapper();
    const workspace = path.join(serverDir, 'workspace');
    const oauth = path.join(serverDir, 'oauth');

    const layout = mounts(createBubblewrapConfig(server())!.args);
    const at = (entry: [string, string, string]) =>
      layout.findIndex((m) => m[0] === entry[0] && m[1] === entry[1] && m[2] === entry[2]);

    const readOnlyParent = at(['--ro-bind', serverDir, serverDir]);
    expect(at(['--bind', workspace, workspace])).toBeGreaterThan(readOnlyParent);
    expect(at(['--bind', oauth, oauth])).toBeGreaterThan(readOnlyParent);
    // Both exist before launch: the read-only parent stops the child creating them.
    expect(fs.statSync(workspace).isDirectory()).toBe(true);
    expect(fs.statSync(oauth).isDirectory()).toBe(true);
  });
});

describe('firejail mount layout', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });

  it('makes the server directory read-only and re-opens only workspace and OAuth', async () => {
    const { createFirejailConfig } = await loadWrapper();

    const args = createFirejailConfig(server())!.args;
    const readOnly = args.indexOf(`--read-only=${serverDir}`);

    expect(readOnly).toBeGreaterThan(-1);
    expect(args.indexOf(`--read-write=${path.join(serverDir, 'workspace')}`)).toBeGreaterThan(readOnly);
    expect(args.indexOf(`--read-write=${path.join(serverDir, 'oauth')}`)).toBeGreaterThan(readOnly);
    expect(args.filter((arg) => arg.startsWith('--read-write=') && arg.includes(`${serverDir}/pnpm`))).toEqual([]);
  });
});

// A real sandbox: needs Linux with unprivileged namespaces (or CAP_SYS_ADMIN).
const canSandbox = (() => {
  if (process.platform !== 'linux') return false;
  try {
    execFileSync('/usr/bin/bwrap', ['--ro-bind', '/', '/', '--unshare-user', '--', '/bin/true'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
})();

it.skipIf(!canSandbox)('a real bubblewrap child cannot write its install directory but can write workspace and OAuth', async () => {
  const { createBubblewrapConfig } = await loadWrapper();
  const script = `
    const fs = require('fs');
    try { fs.writeFileSync(${JSON.stringify(path.join(serverDir, 'pnpm', 'planted'))}, 'x'); process.exit(31); } catch {}
    try { fs.renameSync(${JSON.stringify(path.join(serverDir, 'pnpm'))}, ${JSON.stringify(path.join(serverDir, 'moved'))}); process.exit(32); } catch {}
    fs.writeFileSync(${JSON.stringify(path.join(serverDir, 'workspace', 'ok'))}, 'x');
    fs.writeFileSync(${JSON.stringify(path.join(serverDir, 'oauth', 'ok'))}, 'x');
    console.log('confined');
  `;
  const cfg = createBubblewrapConfig(server({ args: ['-e', script] }))!;

  const out = execFileSync(cfg.command, cfg.args, { env: cfg.env as NodeJS.ProcessEnv, encoding: 'utf8', timeout: 10000 });

  expect(out.trim()).toBe('confined');
  expect(fs.existsSync(path.join(serverDir, 'pnpm', 'planted'))).toBe(false);
  expect(fs.existsSync(path.join(serverDir, 'workspace', 'ok'))).toBe(true);
  expect(fs.existsSync(path.join(serverDir, 'oauth', 'ok'))).toBe(true);
});
