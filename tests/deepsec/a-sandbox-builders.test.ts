/**
 * The sandbox builders returned `command: 'bwrap'` / `'firejail'` and an env in
 * which the server's own variables were spread last. That env is the launcher's
 * environment, so a server env of PATH=<dir the child can write> resolved the
 * launcher to a planted binary, and LD_PRELOAD & co. loaded code into the
 * launcher — both before any isolation existed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ resolve: vi.fn((name: string) => `/trusted/bin/${name}`) }));
vi.mock('@/lib/mcp/sandbox-launcher', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp/sandbox-launcher')>()),
  resolveSandboxLauncher: m.resolve,
}));

import { McpServerType } from '@/db/schema';
import { createBubblewrapConfig, createFirejailConfig } from '@/lib/mcp/client-wrapper';

const realPlatform = process.platform;
beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'linux' });
  m.resolve.mockImplementation((name: string) => `/trusted/bin/${name}`);
});
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
});

const hostile = {
  PATH: '/var/mcp-packages/servers/x/workspace/bin',
  LD_PRELOAD: '/var/mcp-packages/servers/x/workspace/evil.so',
  LD_LIBRARY_PATH: '/var/mcp-packages/servers/x/workspace/lib',
  GCONV_PATH: '/var/mcp-packages/servers/x/workspace/gconv',
  GLIBC_TUNABLES: 'glibc.malloc.x=1',
};

const server: any = {
  uuid: '11111111-1111-4111-8111-111111111111',
  name: 'probe',
  type: McpServerType.STDIO,
  command: 'node',
  args: ['server.js'],
  env: { ...hostile, MY_TOKEN: 'user-supplied' },
};

/** Arguments given to the launcher itself, before the sandboxed command. */
function launcherArgs(args: string[], command: string): string[] {
  const separator = args.indexOf('--');
  return separator >= 0 ? args.slice(0, separator) : args.slice(0, args.indexOf(command));
}

describe('createBubblewrapConfig', () => {
  it('launches the trusted absolute bwrap, not a name for PATH to resolve', () => {
    const cfg = createBubblewrapConfig(server)!;

    expect(cfg.command).toBe('/trusted/bin/bwrap');
    expect(m.resolve).toHaveBeenCalledWith('bwrap');
  });

  it('still names an absolute path when bwrap is not installed, so the launch fails closed', () => {
    m.resolve.mockReturnValue(null as any);

    const cfg = createBubblewrapConfig(server)!;

    expect(cfg.command.startsWith('/')).toBe(true);
    expect(cfg.command.endsWith('/bwrap')).toBe(true);
  });

  it('keeps the server env from choosing the launcher PATH or loading code into it', () => {
    const cfg = createBubblewrapConfig(server)!;

    expect(cfg.env.PATH).not.toBe(hostile.PATH);
    for (const key of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'GCONV_PATH', 'GLIBC_TUNABLES']) {
      expect(cfg.env).not.toHaveProperty(key);
    }
  });

  it('applies those variables inside the sandbox only', () => {
    const cfg = createBubblewrapConfig(server)!;
    const before = launcherArgs(cfg.args, 'node').join('\u0000');

    for (const [key, value] of Object.entries(hostile)) {
      expect(before).toContain(['--setenv', key, value].join('\u0000'));
    }
  });

  it('passes ordinary server variables through unchanged', () => {
    const cfg = createBubblewrapConfig(server)!;

    expect(cfg.env.MY_TOKEN).toBe('user-supplied');
  });
});

describe('createFirejailConfig', () => {
  it('launches the trusted absolute firejail', () => {
    const cfg = createFirejailConfig(server)!;

    expect(cfg.command).toBe('/trusted/bin/firejail');
    expect(m.resolve).toHaveBeenCalledWith('firejail');
  });

  it('keeps launcher-affecting variables out of the launcher environment', () => {
    const cfg = createFirejailConfig(server)!;

    expect(cfg.env.PATH).not.toBe(hostile.PATH);
    for (const key of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'GCONV_PATH', 'GLIBC_TUNABLES']) {
      expect(cfg.env).not.toHaveProperty(key);
    }
    const before = launcherArgs(cfg.args, 'node');
    for (const [key, value] of Object.entries(hostile)) {
      expect(before).toContain(`--env=${key}=${value}`);
    }
    expect(cfg.env.MY_TOKEN).toBe('user-supplied');
  });

  it('does not expose the Docker socket to the child', () => {
    // A Docker socket is root on the host; bubblewrap stopped mounting it, and
    // firejail whitelisted it for every server unless network isolation was on.
    const cfg = createFirejailConfig(server)!;

    expect(cfg.args.join(' ')).not.toContain('docker.sock');
  });
});
