// @vitest-environment node
/**
 * Path building became symlink-aware: buildSecurePath refuses a path whose real
 * location leaves its base. Two directory walks in the package handlers built a
 * path for every entry they listed and then followed it, so a symlink leading
 * out of the directory — which every virtualenv has, bin/python pointing at the
 * system interpreter — now threw instead of being passed over:
 *
 * - UvHandler's executable scan (used when no binary carries the package's name)
 *   failed the whole lookup on `.venv/bin/python`;
 * - getDirectorySize aborted at the first such link, and followed links that
 *   stayed inside, counting their targets twice.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp';
  const dir = `${base}/fu1-pkg-symlinks-${process.pid}-${Date.now()}`;
  process.env.MCP_PACKAGE_STORE_DIR = dir;
  return { dir };
});

const { UvHandler } = await import('@/lib/mcp/package-manager/handlers/uv-handler');

const SERVER = '33333333-3333-4333-8333-333333333333';

let outside: string;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fu1-outside-'));
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  fs.rmSync(store.dir, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

afterAll(() => {
  delete process.env.MCP_PACKAGE_STORE_DIR;
});

function venvBin(): string {
  const bin = path.join(store.dir, 'servers', SERVER, 'uv', '.venv', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  return bin;
}

describe('UvHandler executable scan', () => {
  it('passes over a venv interpreter symlinked out of bin', async () => {
    const bin = venvBin();
    const interpreter = path.join(outside, 'python3.12');
    fs.writeFileSync(interpreter, '#!/bin/sh\n', { mode: 0o755 });
    fs.symlinkSync(interpreter, path.join(bin, 'python'));
    fs.writeFileSync(path.join(bin, 'serve-tool'), '#!/bin/sh\n', { mode: 0o755 });

    const binary = await new UvHandler().getBinaryPath(SERVER, 'unrelated-name');

    expect(binary).not.toBeNull();
    expect(fs.realpathSync(binary!)).toBe(fs.realpathSync(path.join(bin, 'serve-tool')));
  });

  it('does not pick a symlink as the executable', async () => {
    const bin = venvBin();
    const target = path.join(outside, 'elsewhere');
    fs.writeFileSync(target, '#!/bin/sh\n', { mode: 0o755 });
    fs.symlinkSync(target, path.join(bin, 'only-a-link'));

    expect(await new UvHandler().getBinaryPath(SERVER, 'unrelated-name')).toBeNull();
  });
});

describe('getDirectorySize', () => {
  it('counts regular files once and follows no symlink', async () => {
    const dir = path.join(store.dir, 'servers', SERVER, 'uv');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data.bin'), Buffer.alloc(10));
    fs.writeFileSync(path.join(dir, 'sub', 'more.bin'), Buffer.alloc(5));
    fs.writeFileSync(path.join(outside, 'big.bin'), Buffer.alloc(1000));
    fs.symlinkSync(path.join(outside, 'big.bin'), path.join(dir, 'a-out-link'));
    fs.symlinkSync(path.join(dir, 'data.bin'), path.join(dir, 'b-in-link'));
    fs.symlinkSync(outside, path.join(dir, 'c-out-dir'));

    const size = await new UvHandler().getDiskUsage(SERVER);

    expect(size).toBe(15);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
