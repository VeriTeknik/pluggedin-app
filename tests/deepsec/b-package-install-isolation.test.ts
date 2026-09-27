import { promises as fs } from 'fs';
import path from 'path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The pnpm/uv installs run on the host, as the application user, before
 * client-wrapper builds the bubblewrap/firejail sandbox. Nothing they do may run
 * package-controlled code or fetch a user-chosen URL:
 *
 * - a Python sdist runs its PEP 517 build backend during `uv pip install`;
 * - an npm package runs its lifecycle scripts during `pnpm add`;
 * - a URL/VCS spec is fetched by the installer itself, outside safeFetch;
 * - the install directory is bind-mounted read-write into the server's own
 *   sandbox, so anything the server left there (a `.venv/bin/python3`, an
 *   `.npmrc`, a `.pnpmfile.cjs`, a `uv.toml`/`.python-version` one level up) is
 *   attacker-controlled input to the next host-side install.
 *
 * Nothing here reaches the network: every process spawn is mocked.
 */
const store = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? '/tmp'}/b-pkg-isolation-${process.pid}-${Date.now()}`;
  process.env.MCP_PACKAGE_STORE_DIR = dir;
  return { dir };
});

vi.mock('child_process', () => {
  const execFile = vi.fn((_file: string, _args: string[], _opts: any, cb: any) => {
    (typeof cb === 'function' ? cb : _opts)(null, { stdout: '', stderr: '' });
  });
  const exec = vi.fn();
  const spawn = vi.fn();
  return { execFile, exec, spawn, default: { execFile, exec, spawn } };
});

const { execFile } = vi.mocked(await import('child_process'));
const { PnpmHandler } = await import('@/lib/mcp/package-manager/handlers/pnpm-handler');
const { UvHandler } = await import('@/lib/mcp/package-manager/handlers/uv-handler');
const { PackageManager } = await import('@/lib/mcp/package-manager');

const SERVER_UUID = '22222222-2222-4222-8222-222222222222';
const serverDir = path.join(store.dir, 'servers', SERVER_UUID);

type Call = { file: string; args: string[] };
const calls = (): Call[] =>
  execFile.mock.calls.map((c) => ({ file: c[0] as string, args: c[1] as unknown as string[] }));

const exists = (p: string) =>
  fs.access(p).then(
    () => true,
    () => false
  );

beforeEach(async () => {
  vi.clearAllMocks();
  await fs.rm(store.dir, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(store.dir, { recursive: true, force: true });
});

const URL_SPECS = [
  'http://127.0.0.1:8080/package.tgz',
  'https://10.0.0.5/package.tar.gz',
  'git+https://internal.example/repo.git',
];

describe('pnpm install (npx/pnpm servers)', () => {
  it.each([...URL_SPECS, 'owner/repo', 'express@npm:evil'])(
    'refuses %j before spawning anything',
    async (spec) => {
      await expect(
        new PnpmHandler().install({ serverUuid: SERVER_UUID, packageName: spec })
      ).rejects.toThrow();
      expect(execFile).not.toHaveBeenCalled();
    }
  );

  it('never runs lifecycle scripts or a pnpmfile on the host', async () => {
    await new PnpmHandler()
      .install({ serverUuid: SERVER_UUID, packageName: 'some-package' })
      .catch(() => undefined);

    const add = calls().find((c) => c.file === 'pnpm' && c.args.includes('add'));
    expect(add).toBeDefined();
    expect(add!.args).toContain('--ignore-scripts');
    expect(add!.args).toContain('--ignore-pnpmfile');
    expect(add!.args[add!.args.length - 1]).toBe('some-package');
  });

  it('does not reuse configuration the sandboxed server left in its install directory', async () => {
    const installDir = path.join(serverDir, 'pnpm');
    await fs.mkdir(installDir, { recursive: true });
    await fs.writeFile(path.join(installDir, '.npmrc'), 'registry=http://169.254.169.254/\n');
    await fs.writeFile(path.join(installDir, '.pnpmfile.cjs'), 'require("child_process")');

    await new PnpmHandler()
      .install({ serverUuid: SERVER_UUID, packageName: 'some-package' })
      .catch(() => undefined);

    expect(await exists(path.join(installDir, '.npmrc'))).toBe(false);
    expect(await exists(path.join(installDir, '.pnpmfile.cjs'))).toBe(false);
  });
});

describe('uv install (uvx servers)', () => {
  it.each([...URL_SPECS, 'evil@https://10.0.0.5/x.tar.gz', 'evil.tar.gz'])(
    'refuses %j before spawning anything',
    async (spec) => {
      await expect(
        new UvHandler().install({ serverUuid: SERVER_UUID, packageName: spec })
      ).rejects.toThrow();
      expect(execFile).not.toHaveBeenCalled();
    }
  );

  it('installs wheels only, so no build backend runs on the host', async () => {
    await new UvHandler()
      .install({ serverUuid: SERVER_UUID, packageName: 'sdist-only-package' })
      .catch(() => undefined);

    const install = calls().find(
      (c) => c.file === 'uv' && c.args[0] === 'pip' && c.args[1] === 'install'
    );
    expect(install).toBeDefined();
    expect(install!.args).toContain('--no-build');
    expect(install!.args[install!.args.length - 1]).toBe('sdist-only-package');
  });

  it('never discovers uv.toml, pyproject.toml or .python-version from the server directory', async () => {
    await new UvHandler()
      .install({ serverUuid: SERVER_UUID, packageName: 'some-package' })
      .catch(() => undefined);

    const uvCalls = calls().filter((c) => c.file === 'uv');
    expect(uvCalls.length).toBeGreaterThan(0);
    for (const call of uvCalls) {
      expect(call.args, `uv ${call.args.join(' ')}`).toContain('--no-config');
    }
  });

  it('creates a fresh virtualenv rather than running an interpreter the server planted', async () => {
    const planted = path.join(serverDir, 'uv', '.venv', 'bin', 'python3');
    await fs.mkdir(path.dirname(planted), { recursive: true });
    await fs.writeFile(planted, '#!/bin/sh\ntouch /tmp/PWNED\n', { mode: 0o755 });

    await new UvHandler()
      .install({ serverUuid: SERVER_UUID, packageName: 'some-package' })
      .catch(() => undefined);

    expect(await exists(planted)).toBe(false);
    expect(calls().some((c) => c.file === 'uv' && c.args[0] === 'venv')).toBe(true);
  });
});

describe('PackageManager.transformCommand', () => {
  it('installs a uvx package wheels-only', async () => {
    await new PackageManager()
      .transformCommand('uvx', ['sdist-only-package'], SERVER_UUID)
      .catch(() => undefined);

    const install = calls().find(
      (c) => c.file === 'uv' && c.args[0] === 'pip' && c.args[1] === 'install'
    );
    expect(install).toBeDefined();
    expect(install!.args).toContain('--no-build');
  });

  it.each([
    ['uvx', ['http://127.0.0.1:8080/package.tar.gz']],
    ['npx', ['-y', 'http://127.0.0.1:8080/package.tgz']],
    ['pnpm', ['dlx', 'https://10.0.0.5/package.tgz']],
  ])('never hands a URL package to the host-side installer (%s)', async (command, args) => {
    await new PackageManager().transformCommand(command, args, SERVER_UUID).catch(() => undefined);

    for (const call of calls()) {
      expect(call.args.join(' ')).not.toMatch(/https?:\/\//);
    }
  });
});
