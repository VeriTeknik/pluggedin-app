// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';
// This integration fixture needs a Linux host with unprivileged namespaces.
const canSandbox = (() => {
 if (process.platform !== 'linux') return false;
 try { execFileSync('bwrap', ['--ro-bind', '/', '/', '--unshare-user', '--', '/bin/true'], { stdio: 'ignore', timeout: 5000 }); return true; } catch { return false; }
})();
it.skipIf(!canSandbox)('a real bubblewrap child cannot read sibling credentials and can write its private cache', async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-isolation-'));
 const uuid = '11111111-1111-4111-8111-111111111111';
 const own = path.join(root, 'servers', uuid);
 const sibling = path.join(root, 'servers', '22222222-2222-4222-8222-222222222222');
 fs.mkdirSync(path.join(own, 'workspace'), { recursive: true });
 fs.mkdirSync(sibling, { recursive: true });
 fs.writeFileSync(path.join(sibling, 'token'), 'sibling-secret');
 vi.stubEnv('MCP_PACKAGE_STORE_DIR', root);
 try {
  vi.resetModules();
  const { createBubblewrapConfig } = await import('@/lib/mcp/client-wrapper');
  const cfg = createBubblewrapConfig({ uuid, type: 'STDIO', command: 'node', args: ['-e', `
   const fs = require('fs');
   if (fs.existsSync(${JSON.stringify(sibling)})) process.exit(21);
   if (fs.existsSync('/var/run/docker.sock')) process.exit(22);
   fs.mkdirSync(process.env.UV_CACHE_DIR, { recursive: true });
   fs.writeFileSync(process.env.UV_CACHE_DIR + '/probe', 'private');
   console.log('isolated');
  `], env: {}, name: 'fixture' } as any)!;
  expect(execFileSync(cfg.command, cfg.args, { env: cfg.env, encoding: 'utf8', timeout: 5000 }).trim()).toBe('isolated');
  expect(fs.readFileSync(path.join(own, 'workspace/.cache/uv/probe'), 'utf8')).toBe('private');
 } finally { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); }
});
