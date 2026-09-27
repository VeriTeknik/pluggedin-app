// @vitest-environment node
/**
 * OAuthProcessManager reads token files back from, and clears them out of,
 * `<store>/servers/<uuid>/oauth/.mcp-auth` on the host. Those paths are
 * realpath-checked when they are built (buildSecurePath), but everything under
 * `oauth` is written by the server's sandboxed child, which can turn
 * `.mcp-auth`, or a token file in it, into a symlink *after* that check — the
 * OAuth flow runs for minutes. readFile and unlink then followed the link: the
 * host read another tenant's token into this server's config, and deleted the
 * other tenant's token files.
 *
 * To model the race deterministically, buildSecurePath here only joins: the
 * check ran while the path was still clean, and the link appeared afterwards.
 * Reads now open without following the last link, require a regular file and
 * check where the opened file actually is; clears go through a directory
 * opened without following links.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/secure-path-builder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/secure-path-builder')>();
  return {
    ...actual,
    buildSecurePath: (base: string, ...components: string[]) =>
      path.join(base, ...components.map((component) => actual.validatePathComponent(component))),
  };
});

const ATTACKER = '11111111-1111-4111-8111-111111111111';
const VICTIM = '22222222-2222-4222-8222-222222222222';

let store: string;
let attackerAuth: string;
let victimAuth: string;

beforeEach(() => {
  store = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r2b-oauth-tokens-')));
  attackerAuth = path.join(store, 'servers', ATTACKER, 'oauth', '.mcp-auth');
  victimAuth = path.join(store, 'servers', VICTIM, 'oauth', '.mcp-auth');
  fs.mkdirSync(path.join(victimAuth, 'probe'), { recursive: true });
  fs.writeFileSync(path.join(victimAuth, 'probe', 'x.json'), '{"access_token":"victim"}');
  fs.writeFileSync(path.join(victimAuth, 'tokens.json'), '{"access_token":"victim"}');
  fs.mkdirSync(path.join(store, 'servers', ATTACKER, 'oauth'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(store, { recursive: true, force: true });
});

async function manager() {
  const { OAuthProcessManager } = await import('@/lib/mcp/oauth-process-manager');
  return new OAuthProcessManager() as any;
}

const victimFilesIntact = () => {
  expect(fs.existsSync(path.join(victimAuth, 'tokens.json'))).toBe(true);
  expect(fs.existsSync(path.join(victimAuth, 'probe', 'x.json'))).toBe(true);
};

describe('clearing old tokens', () => {
  it("does not follow a .mcp-auth swapped for a link into another server's", async () => {
    fs.symlinkSync(victimAuth, attackerAuth);

    await (await manager()).clearExistingTokens('probe', attackerAuth);

    victimFilesIntact();
  });

  it("does not follow a server subdirectory swapped for a link into another server's", async () => {
    fs.mkdirSync(attackerAuth, { recursive: true });
    fs.symlinkSync(path.join(victimAuth, 'probe'), path.join(attackerAuth, 'probe'));

    await (await manager()).clearExistingTokens('probe', attackerAuth);

    victimFilesIntact();
  });

  it("still clears the server's own token files", async () => {
    fs.mkdirSync(path.join(attackerAuth, 'probe'), { recursive: true });
    fs.writeFileSync(path.join(attackerAuth, 'tokens.json'), '{"access_token":"old"}');
    fs.writeFileSync(path.join(attackerAuth, 'probe', 'x.json'), '{"access_token":"old"}');

    await (await manager()).clearExistingTokens('probe', attackerAuth);

    expect(fs.existsSync(path.join(attackerAuth, 'tokens.json'))).toBe(false);
    expect(fs.existsSync(path.join(attackerAuth, 'probe'))).toBe(false);
  });
});

describe('reading tokens back', () => {
  it("does not read a token file swapped for a link to another server's", async () => {
    fs.mkdirSync(attackerAuth, { recursive: true });
    fs.symlinkSync(path.join(victimAuth, 'tokens.json'), path.join(attackerAuth, 'tokens.json'));

    expect(await (await manager()).checkMcpAuthToken('probe', attackerAuth)).toBeNull();
  });

  it("does not read through a .mcp-auth swapped for a link into another server's", async () => {
    fs.symlinkSync(victimAuth, attackerAuth);

    expect(await (await manager()).checkMcpAuthToken('probe', attackerAuth)).toBeNull();
  });

  it('does not block on a FIFO planted where a token file is expected', async () => {
    fs.mkdirSync(attackerAuth, { recursive: true });
    execFileSync('mkfifo', [path.join(attackerAuth, 'tokens.json')]);

    expect(await (await manager()).checkMcpAuthToken('probe', attackerAuth)).toBeNull();
  }, 5000);

  it('still reads a token the server wrote itself', async () => {
    fs.mkdirSync(path.join(attackerAuth, 'mcp-remote-0.1.0'), { recursive: true });
    fs.writeFileSync(
      path.join(attackerAuth, 'mcp-remote-0.1.0', 'abc_tokens.json'),
      '{"access_token":"own","refresh_token":"r"}'
    );

    const result = await (await manager()).checkMcpAuthToken('probe', attackerAuth);

    expect(result).toMatchObject({ success: true, token: 'own' });
  });

  it('still reads a plain token file the server wrote itself', async () => {
    fs.mkdirSync(attackerAuth, { recursive: true });
    fs.writeFileSync(path.join(attackerAuth, 'tokens.json'), '{"access_token":"own"}');

    const result = await (await manager()).checkMcpAuthToken('probe', attackerAuth);

    expect(result).toMatchObject({ success: true, token: 'own' });
  });
});
