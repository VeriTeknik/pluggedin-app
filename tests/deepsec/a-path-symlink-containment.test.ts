// @vitest-environment node
/**
 * buildSecurePath and isPathWithinDirectory checked containment lexically.
 * Filesystem calls follow symlinks, and the per-server package directory is
 * writable by the sandboxed MCP child — so a child could plant
 * `oauth/.mcp-auth -> /app` (host-side recursive delete lands in /app/<name>)
 * or `oauth/.mcp-auth/mcp-remote-x -> <another server's token dir>` (host-side
 * token scan reads another tenant's OAuth token), and both paths passed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildSecurePath, buildServerScopedPath } from '@/lib/secure-path-builder';
import { isPathWithinDirectory } from '@/lib/security';

let root: string;
let base: string;
let outside: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-symlink-'));
  base = path.join(root, 'servers', 'attacker', 'oauth');
  outside = path.join(root, 'servers', 'victim', 'oauth', '.mcp-auth');
  fs.mkdirSync(base, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'x_tokens.json'), '{"access_token":"victim"}');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('buildSecurePath', () => {
  it('rejects a final component that is a symlink out of the base', () => {
    fs.symlinkSync(outside, path.join(base, '.mcp-auth'));

    expect(() => buildSecurePath(base, '.mcp-auth')).toThrow(/escapes base directory/);
  });

  it('rejects a path that runs through a symlinked directory out of the base', () => {
    fs.symlinkSync(outside, path.join(base, 'mcp-remote-0.1.0'));

    expect(() => buildSecurePath(base, 'mcp-remote-0.1.0', 'x_tokens.json')).toThrow(/escapes base directory/);
  });

  it('rejects a symlinked file pointing out of the base', () => {
    fs.symlinkSync(path.join(outside, 'x_tokens.json'), path.join(base, 'x_tokens.json'));

    expect(() => buildSecurePath(base, 'x_tokens.json')).toThrow(/escapes base directory/);
  });

  it('rejects a dangling symlink, which a later write or mkdir would follow', () => {
    fs.symlinkSync(path.join(root, 'elsewhere', 'new-dir'), path.join(base, '.mcp-auth'));

    expect(() => buildSecurePath(base, '.mcp-auth')).toThrow(/escapes base directory/);
    expect(() => buildSecurePath(base, '.mcp-auth', 'server')).toThrow(/escapes base directory/);
  });

  it('allows a symlink that stays inside the base (package-manager layouts)', () => {
    fs.mkdirSync(path.join(base, 'node_modules', '.pnpm', 'pkg@1.0.0', 'node_modules', 'pkg'), { recursive: true });
    fs.symlinkSync(
      path.join('.pnpm', 'pkg@1.0.0', 'node_modules', 'pkg'),
      path.join(base, 'node_modules', 'pkg')
    );

    expect(buildSecurePath(base, 'node_modules', 'pkg', 'package.json')).toBe(
      path.join(base, 'node_modules', 'pkg', 'package.json')
    );
  });

  it('allows paths that do not exist yet', () => {
    expect(buildSecurePath(base, 'not', 'there', 'yet')).toBe(path.join(base, 'not', 'there', 'yet'));
  });

  it('accepts a base that is itself reached through a symlink', () => {
    const alias = path.join(root, 'alias');
    fs.symlinkSync(base, alias);

    expect(buildSecurePath(alias, 'tokens')).toBe(path.join(alias, 'tokens'));
  });
});

describe('buildServerScopedPath', () => {
  const ATTACKER = '11111111-1111-4111-8111-111111111111';
  const VICTIM = '22222222-2222-4222-8222-222222222222';

  it('refuses a component symlinked into a sibling server, which stays inside the store', () => {
    fs.mkdirSync(path.join(root, 'servers', VICTIM, 'oauth'), { recursive: true });
    fs.mkdirSync(path.join(root, 'servers', ATTACKER), { recursive: true });
    fs.symlinkSync(path.join(root, 'servers', VICTIM, 'oauth'), path.join(root, 'servers', ATTACKER, 'oauth'));

    // Anchored at the shared store this passes — the link never leaves it.
    expect(() => buildSecurePath(root, 'servers', ATTACKER, 'oauth')).not.toThrow();
    expect(() => buildServerScopedPath(root, ATTACKER, 'oauth')).toThrow(/escapes base directory/);
  });

  it('builds an ordinary path inside the server directory', () => {
    expect(buildServerScopedPath(root, ATTACKER, 'oauth', '.mcp-auth')).toBe(
      path.join(root, 'servers', ATTACKER, 'oauth', '.mcp-auth')
    );
  });

  it('rejects a server id that is not a single path component', () => {
    expect(() => buildServerScopedPath(root, '../x', 'oauth')).toThrow();
  });
});

describe('isPathWithinDirectory', () => {
  it('is false for a path whose real location is outside the directory', () => {
    fs.symlinkSync(outside, path.join(base, 'link'));

    expect(isPathWithinDirectory(path.join(base, 'link', 'x_tokens.json'), base)).toBe(false);
  });

  it('is true for an ordinary path inside the directory', () => {
    fs.writeFileSync(path.join(base, 'file'), 'ok');

    expect(isPathWithinDirectory(path.join(base, 'file'), base)).toBe(true);
    expect(isPathWithinDirectory(path.join(base, 'missing'), base)).toBe(true);
  });
});
