/**
 * The sandbox builders keep variables that act on the launcher (PATH, LD_*,
 * GCONV_PATH…) out of the launcher's environment and apply them inside the
 * sandbox only. But NODE_OPTIONS, PYTHONPATH, BASH_ENV, PERL5OPT and the rest of
 * what isExecutionAlteringEnvKey names still went to bwrap / firejail as their
 * own environment — before any namespace exists — whereas they are only meant
 * for the server. They are legitimate inside the sandbox, so they must still
 * reach the server there, through the launcher's set-env option.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ resolve: vi.fn((name: string) => `/trusted/bin/${name}`) }));
vi.mock('@/lib/mcp/sandbox-launcher', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp/sandbox-launcher')>()),
  resolveSandboxLauncher: m.resolve,
}));

import { McpServerType } from '@/db/schema';
import { createBubblewrapConfig, createFirejailConfig } from '@/lib/mcp/client-wrapper';
import { isLauncherEnvVar, splitServerEnv } from '@/lib/mcp/sandbox-launcher';

const realPlatform = process.platform;
beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'linux' });
});
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
});

const executionAltering = {
  NODE_OPTIONS: '--require /var/mcp-packages/servers/x/workspace/hook.js',
  PYTHONPATH: '/var/mcp-packages/servers/x/workspace/py',
  PYTHONSTARTUP: '/var/mcp-packages/servers/x/workspace/startup.py',
  BASH_ENV: '/var/mcp-packages/servers/x/workspace/env.sh',
  PERL5OPT: '-Mevil',
  RUBYOPT: '-revil',
};

const server: any = {
  uuid: '11111111-1111-4111-8111-111111111111',
  name: 'probe',
  type: McpServerType.STDIO,
  command: 'node',
  args: ['server.js'],
  env: { ...executionAltering, MY_TOKEN: 'user-supplied' },
};

function launcherArgs(args: string[], command: string): string[] {
  const separator = args.indexOf('--');
  return separator >= 0 ? args.slice(0, separator) : args.slice(0, args.indexOf(command));
}

describe('isLauncherEnvVar', () => {
  it.each(Object.keys(executionAltering))('treats %s as launcher-affecting', (key) => {
    expect(isLauncherEnvVar(key)).toBe(true);
    expect(isLauncherEnvVar(key.toLowerCase())).toBe(true);
  });

  it('leaves ordinary server variables to the launcher environment', () => {
    expect(isLauncherEnvVar('MY_TOKEN')).toBe(false);
    expect(isLauncherEnvVar('GITHUB_PERSONAL_ACCESS_TOKEN')).toBe(false);
  });

  it('keeps every execution-altering variable, moving it to the sandbox side', () => {
    const { launcherEnv, sandboxOnlyEnv } = splitServerEnv(server.env);

    expect(sandboxOnlyEnv).toEqual(executionAltering);
    expect(launcherEnv).toEqual({ MY_TOKEN: 'user-supplied' });
  });
});

describe('createBubblewrapConfig', () => {
  it('does not hand execution-altering server variables to bwrap', () => {
    const cfg = createBubblewrapConfig(server)!;

    for (const [key, value] of Object.entries(executionAltering)) {
      expect(cfg.env[key]).not.toBe(value);
    }
  });

  it('applies them inside the sandbox with --setenv', () => {
    const cfg = createBubblewrapConfig(server)!;
    const before = launcherArgs(cfg.args, 'node').join('\u0000');

    for (const [key, value] of Object.entries(executionAltering)) {
      expect(before).toContain(['--setenv', key, value].join('\u0000'));
    }
    expect(cfg.env.MY_TOKEN).toBe('user-supplied');
  });
});

describe('createFirejailConfig', () => {
  it('does not hand them to firejail, and applies them with --env=', () => {
    const cfg = createFirejailConfig(server)!;
    const before = launcherArgs(cfg.args, 'node');

    for (const [key, value] of Object.entries(executionAltering)) {
      expect(cfg.env[key]).not.toBe(value);
      expect(before).toContain(`--env=${key}=${value}`);
    }
    expect(cfg.env.MY_TOKEN).toBe('user-supplied');
  });
});
