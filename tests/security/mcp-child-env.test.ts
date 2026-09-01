import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { McpServerType } from '@/db/schema';
import { createBubblewrapConfig, createFirejailConfig } from '@/lib/mcp/client-wrapper';

/**
 * A spawned MCP server is a process the user chose. The app's own process.env
 * carries the whole secret set — docker-compose preloads /run/secrets/app.env
 * through `NODE_OPTIONS: -r dotenv/config` — so spreading it into that child
 * hands NEXTAUTH_SECRET, DATABASE_URL and every provider key to whoever
 * configured the server.
 */
const PLANTED = {
  NEXTAUTH_SECRET: 'planted-nextauth-secret',
  DATABASE_URL: 'postgresql://planted:planted@db/planted',
  ANTHROPIC_API_KEY: 'planted-anthropic-key',
  K8S_SERVICE_ACCOUNT_TOKEN: 'planted-k8s-token',
  GITHUB_TOKEN: 'planted-github-token',
  POSTGRES_PASSWORD: 'planted-pg-password',
};

const server: any = {
  uuid: '11111111-1111-4111-8111-111111111111',
  name: 'test',
  type: McpServerType.STDIO,
  command: 'npx',
  args: ['-y', 'some-package'],
  env: {},
};

beforeEach(() => {
  Object.assign(process.env, PLANTED);
  process.env.TZ = 'Europe/Istanbul';
});

afterEach(() => {
  for (const k of Object.keys(PLANTED)) delete process.env[k];
});

function envOf(cfg: any): Record<string, string> {
  return cfg.env ?? cfg.finalEnv ?? {};
}

describe.each([
  ['bubblewrap', createBubblewrapConfig],
  ['firejail', createFirejailConfig],
])('%s child environment', (_name, build) => {
  it('withholds every host secret', () => {
    const env = envOf((build as any)(server));

    for (const key of Object.keys(PLANTED)) {
      expect(env).not.toHaveProperty(key);
    }
    const serialized = JSON.stringify(env);
    for (const value of Object.values(PLANTED)) {
      expect(serialized).not.toContain(value);
    }
  });

  it('keeps the explicitly constructed PATH and HOME rather than the host ones', () => {
    const env = envOf((build as any)(server));

    expect(env.PATH).toBeDefined();
    expect(env.PATH).toContain('/usr/bin');
    expect(env.HOME).toBeDefined();
    expect(env.HOME).not.toBe(process.env.HOME);
  });

  it('still passes the interpreter settings the child needs', () => {
    const env = envOf((build as any)(server));

    expect(env.NODE_ENV).toBe('production');
    expect(env.UV_SYSTEM_PYTHON).toBe('true');
    expect(env.PNPM_STORE_DIR).toBeDefined();
  });

  it('lets a harmless host variable through', () => {
    const env = envOf((build as any)(server));

    expect(env.TZ).toBe('Europe/Istanbul');
  });

  it("still applies the server's own env, which wins", () => {
    const env = envOf((build as any)({ ...server, env: { MY_TOKEN: 'user-supplied', NODE_ENV: 'development' } }));

    expect(env.MY_TOKEN).toBe('user-supplied');
    expect(env.NODE_ENV).toBe('development');
  });
});
