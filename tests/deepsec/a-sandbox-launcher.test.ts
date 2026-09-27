// @vitest-environment node
/**
 * The sandbox launcher (bwrap / firejail) was spawned by bare name, so the OS
 * resolved it through the PATH of the environment handed to the launch — an
 * environment the server's own configuration and the package manager write,
 * and which named directories the sandboxed child can itself write to. A
 * planted `bwrap` there ran as the application user before any sandbox existed.
 *
 * The launcher must come from a fixed, root-owned system location instead.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveSandboxLauncher, TRUSTED_LAUNCHER_DIRS } from '@/lib/mcp/sandbox-launcher';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a-launcher-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('resolveSandboxLauncher', () => {
  it('only looks in root-owned system directories by default', () => {
    for (const dir of TRUSTED_LAUNCHER_DIRS) {
      expect(path.isAbsolute(dir)).toBe(true);
      expect(dir.startsWith(os.homedir())).toBe(false);
    }
  });

  it('returns the absolute path of a root-owned executable in a trusted directory', () => {
    // /bin/sh is root-owned and not group/world-writable on every POSIX host.
    const resolved = resolveSandboxLauncher('sh', ['/bin']);

    expect(resolved).toBe('/bin/sh');
  });

  it('never consults PATH', () => {
    const planted = tempDir();
    const fake = path.join(planted, 'bwrap');
    fs.writeFileSync(fake, '#!/bin/sh\necho pwned\n', { mode: 0o755 });
    const savedPath = process.env.PATH;
    process.env.PATH = `${planted}:${savedPath}`;
    try {
      expect(resolveSandboxLauncher('bwrap', [])).toBeNull();
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it('refuses a candidate that group or others can modify', () => {
    const dir = tempDir();
    const candidate = path.join(dir, 'bwrap');
    fs.writeFileSync(candidate, '#!/bin/sh\n', { mode: 0o755 });
    fs.chmodSync(candidate, 0o777);

    expect(resolveSandboxLauncher('bwrap', [dir])).toBeNull();
  });

  it('refuses a candidate not owned by root', () => {
    if (process.getuid?.() === 0) return; // everything a root runner creates is root-owned
    const dir = tempDir();
    const candidate = path.join(dir, 'bwrap');
    fs.writeFileSync(candidate, '#!/bin/sh\n', { mode: 0o755 });

    expect(resolveSandboxLauncher('bwrap', [dir])).toBeNull();
  });

  it('returns null when nothing is installed', () => {
    expect(resolveSandboxLauncher('definitely-not-a-sandbox-binary', ['/bin'])).toBeNull();
  });
});
