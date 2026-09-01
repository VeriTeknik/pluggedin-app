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

/** Snapshot every variable this file touches, so the suite leaves env as it found it. */
const TOUCHED = [...Object.keys(PLANTED), 'TZ', 'PATH', 'HTTP_PROXY', 'HTTPS_PROXY'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
  Object.assign(process.env, PLANTED);
  process.env.TZ = 'Europe/Istanbul';
});

afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
});

function envOf(cfg: any): Record<string, string> {
  return cfg.env ?? cfg.finalEnv ?? {};
}

// Both builders return null off Linux, so their assertions only mean anything there.
describe.skipIf(process.platform !== 'linux').each([
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

describe('inheritableChildEnv', () => {
  it('strips credentials from proxy URLs', async () => {
    const { inheritableChildEnv } = await import('@/lib/mcp/child-env');
    process.env.HTTPS_PROXY = 'http://proxyuser:proxypass@proxy.internal:3128';

    const env = inheritableChildEnv();

    expect(env.HTTPS_PROXY).toBeDefined();
    expect(env.HTTPS_PROXY).not.toContain('proxypass');
    expect(env.HTTPS_PROXY).not.toContain('proxyuser');
    expect(env.HTTPS_PROXY).toContain('proxy.internal:3128');
  });

  it('withholds a proxy value it cannot parse rather than forwarding it', async () => {
    const { inheritableChildEnv } = await import('@/lib/mcp/child-env');
    process.env.HTTP_PROXY = 'not a url';

    expect(inheritableChildEnv()).not.toHaveProperty('HTTP_PROXY');
  });

  it('carries no application secret', async () => {
    const { inheritableChildEnv } = await import('@/lib/mcp/child-env');

    const serialized = JSON.stringify(inheritableChildEnv());
    for (const value of Object.values(PLANTED)) {
      expect(serialized).not.toContain(value);
    }
  });
});

describe('inheritableChildEnv NODE_ENV', () => {
  it('always carries NODE_ENV, which spawn options require', async () => {
    const { inheritableChildEnv } = await import('@/lib/mcp/child-env');

    expect(inheritableChildEnv().NODE_ENV).toBeDefined();
  });
});

describe('approvedChildPath', () => {
  it('includes the configured interpreter directories and the system paths', async () => {
    const { approvedChildPath } = await import('@/lib/mcp/child-env');
    const { PackageManagerConfig } = await import('@/lib/mcp/package-manager/config');

    const p = approvedChildPath();

    expect(p).toContain(PackageManagerConfig.NODEJS_BIN_DIR);
    expect(p).toContain(PackageManagerConfig.PYTHON_BIN_DIR);
    expect(p).toContain('/usr/bin');
  });

  it('does not simply reuse the host PATH', async () => {
    const { approvedChildPath } = await import('@/lib/mcp/child-env');
    process.env.PATH = '/attacker/controlled/dir:/usr/bin';

    expect(approvedChildPath()).not.toContain('/attacker/controlled/dir');
  });
});
