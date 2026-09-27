import { describe, expect, it } from 'vitest';

import {
  sanitizeCollectionContent,
  sanitizeConnectionString,
  sanitizeServerTemplate,
} from '@/lib/server-template';

/**
 * A shared template or collection is world-readable, so the sanitizer has to
 * fail closed: anything it does not recognise as safe structure is dropped or
 * redacted rather than published.
 *
 * Credentials are assembled from parts, as in
 * tests/security/server-template-sanitizer.test.ts: the values are identical,
 * but a literal `scheme://user:pass@host` in source reads as a leaked
 * credential to secret scanners.
 */
const PW = 'hunter' + '2-live';
const TOKEN = 'tok' + '-live-9f8e7d';

describe('sanitizeConnectionString: credentials in URLs of any scheme', () => {
  it.each([
    ['postgres', `postgres://alice:${PW}@db.example.com:5432/app`],
    ['postgresql without a path', `postgresql://alice:${PW}@db.example.com`],
    ['mongodb+srv', `mongodb+srv://alice:${PW}@cluster0.example.net/app?retryWrites=true`],
    ['redis', `redis://default:${PW}@cache.example.com:6379/0`],
    ['rediss with an empty user', `rediss://:${PW}@cache.example.com:6380`],
    ['amqp', `amqp://alice:${PW}@mq.example.com/vhost`],
    ['mysql without a path', `mysql://alice:${PW}@db.example.com:3306`],
    ['a password containing @', `postgres://alice:${PW}@x@db.example.com/app`],
    ['a password containing an unencoded /', `postgres://alice:${PW}/x@db.example.com/app`],
    ['a flag value', `--database=postgres://alice:${PW}@db.example.com/app`],
    ['an env-style assignment', `DATABASE_URL=mongodb+srv://alice:${PW}@cluster0.example.net/app`],
  ])('masks the password in %s', (_label, value) => {
    const sanitized = sanitizeConnectionString(value);

    expect(sanitized).not.toContain(PW);
    expect(sanitized).toMatch(/example\.(com|net)/);
  });

  it('masks every URL in a token that carries several', () => {
    const sanitized = sanitizeConnectionString(
      `--brokers=amqp://mq.example.com/a,amqp://alice:${PW}@mq2.example.com/b`
    );

    expect(sanitized).not.toContain(PW);
    expect(sanitized).toContain('mq2.example.com/b');
  });

  it('masks a bare token carried as userinfo', () => {
    const sanitized = sanitizeConnectionString(`https://${TOKEN}@github.com/acme/repo.git`);

    expect(sanitized).not.toContain(TOKEN);
    expect(sanitized).toContain('github.com/acme/repo.git');
  });

  it('keeps the user name so the importer knows whose password to supply', () => {
    expect(sanitizeConnectionString(`postgres://alice:${PW}@db.example.com/app`)).toBe(
      'postgres://alice:<YOUR_PASSWORD>@db.example.com/app'
    );
  });

  it('masks the password in a Go-style MySQL DSN', () => {
    const sanitized = sanitizeConnectionString(`alice:${PW}@tcp(db.example.com:3306)/app`);

    expect(sanitized).not.toContain(PW);
    expect(sanitized).toContain('tcp(db.example.com:3306)/app');
  });

  it('masks a bearer token in free text', () => {
    const sanitized = sanitizeConnectionString(`Authorization: Bearer ${TOKEN}`);

    expect(sanitized).not.toContain(TOKEN);
  });

  it.each([
    'GITHUB_PERSONAL_ACCESS_TOKEN',
    'OPENAI_API_KEY',
    'STRIPE_KEY',
    'DB_PASSWORD',
    'GITHUB_PAT',
  ])('masks a %s=value assignment', (name) => {
    const sanitized = sanitizeConnectionString(`${name}=${TOKEN}`);

    expect(sanitized).not.toContain(TOKEN);
    expect(sanitized).toContain(`${name}=`);
  });

  it('masks a credential inside a JSON-valued argument', () => {
    const sanitized = sanitizeConnectionString(`--config={"apiKey":"${TOKEN}","region":"eu"}`);

    expect(sanitized).not.toContain(TOKEN);
    expect(sanitized).toContain('"region":"eu"');
  });

  it.each([
    'https://api.example.com/mcp',
    'https://api.example.com:8443/mcp?version=2',
    'http://[::1]:8080/mcp',
    '@modelcontextprotocol/server-filesystem@latest',
    'ghcr.io/acme/server:1.2.3@sha256:0123456789abcdef',
    'mcp/redis:7@sha256:0123456789abcdef',
    '--port',
    '8080',
    'user@example.com',
  ])('leaves the innocuous %s alone', (value) => {
    expect(sanitizeConnectionString(value)).toBe(value);
  });

  // Shared templates and collections are authored by anyone and sanitized on
  // anonymous read paths, so a pattern that backtracks quadratically is a way
  // to pin the server's CPU with one crafted collection.
  it.each([
    ['a run of letters (scheme search)', 'a'.repeat(100_000)],
    ['a long URL tail', 'x://' + 'y'.repeat(100_000)],
    ['back-to-back schemes', 'a://'.repeat(25_000)],
    ['repeated credential terms', 'token'.repeat(20_000)],
    ['a query string of credential terms', '?' + 'token'.repeat(20_000)],
    ['a flag of credential terms', '--' + 'token-'.repeat(16_000)],
    ['DSN-shaped fragments', '=a:bbbbbb'.repeat(12_000)],
  ])('stays fast on %s', (_label, input) => {
    const started = performance.now();
    sanitizeConnectionString(input);

    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('is idempotent on every redaction it makes', () => {
    const inputs = [
      `postgres://alice:${PW}@db.example.com/app`,
      `https://${TOKEN}@github.com/acme/repo.git`,
      `alice:${PW}@tcp(db.example.com:3306)/app`,
      `Authorization: Bearer ${TOKEN}`,
      `GITHUB_TOKEN=${TOKEN}`,
      `--config={"apiKey":"${TOKEN}"}`,
    ];

    for (const input of inputs) {
      const once = sanitizeConnectionString(input);
      expect(sanitizeConnectionString(once)).toBe(once);
    }
  });
});

describe('sanitizeServerTemplate: argv pairs', () => {
  it('redacts the value of a docker -e / --env pair but keeps the variable name', () => {
    const sanitized: any = sanitizeServerTemplate({
      command: 'docker',
      args: ['run', '-i', '--rm', '-e', `GITHUB_TOKEN=${TOKEN}`, '--env', `REGION=${PW}`, '-e', 'HOME', 'ghcr.io/acme/server'],
    });

    const joined = sanitized.args.join(' ');
    expect(joined).not.toContain(TOKEN);
    expect(joined).not.toContain(PW);
    expect(sanitized.args).toContain('HOME');
    expect(sanitized.args[4]).toMatch(/^GITHUB_TOKEN=/);
    expect(sanitized.args[6]).toMatch(/^REGION=/);
    expect(sanitized.args.at(-1)).toBe('ghcr.io/acme/server');
  });

  it('redacts the value of a --header / -H pair but keeps the header name', () => {
    const sanitized: any = sanitizeServerTemplate({
      command: 'npx',
      args: ['mcp-remote', 'https://mcp.example.com/sse', '--header', `Authorization: Bearer ${TOKEN}`, '-H', `X-Tenant: ${PW}`],
    });

    const joined = sanitized.args.join(' ');
    expect(joined).not.toContain(TOKEN);
    expect(joined).not.toContain(PW);
    expect(sanitized.args[3]).toMatch(/^Authorization:/);
    expect(sanitized.args[5]).toMatch(/^X-Tenant:/);
    expect(sanitized.args[1]).toBe('https://mcp.example.com/sse');
  });

  it('redacts a positional database URL argument', () => {
    const sanitized: any = sanitizeServerTemplate({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', `postgres://alice:${PW}@db.example.com/app`],
    });

    expect(sanitized.args.join(' ')).not.toContain(PW);
    expect(sanitized.args[1]).toBe('@modelcontextprotocol/server-postgres');
  });
});

describe('sanitizeServerTemplate: transport options', () => {
  it('does not publish requestInit headers, where the OAuth refresh writes the access token', () => {
    const sanitized: any = sanitizeServerTemplate({
      type: 'STREAMABLE_HTTP',
      url: 'https://mcp.example.com/mcp',
      streamableHTTPOptions: {
        requestInit: { headers: { Authorization: `Bearer ${TOKEN}` }, credentials: 'include' },
        headers: { Authorization: `Bearer ${TOKEN}`, 'X-Api-Key': PW },
        authProvider: { tokens: { access_token: TOKEN } },
        reconnectionOptions: { maxRetries: 3 },
      },
    });

    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(PW);
    // The importer still learns which headers it has to supply.
    expect(Object.keys(sanitized.streamableHTTPOptions.headers).sort()).toEqual([
      'Authorization',
      'X-Api-Key',
    ]);
  });

  it('keeps only the header names when headers arrive as [name, value] pairs', () => {
    const sanitized: any = sanitizeServerTemplate({
      streamableHTTPOptions: { headers: [['Authorization', `Bearer ${TOKEN}`]] },
    });

    expect(JSON.stringify(sanitized)).not.toContain(TOKEN);
    expect(Object.keys(sanitized.streamableHTTPOptions.headers)).toEqual(['Authorization']);
  });
});

describe('sanitizeServerTemplate: fails closed on fields it does not know', () => {
  const poisoned = {
    uuid: '11111111-1111-4111-8111-111111111111',
    name: 'pg',
    description: 'Postgres MCP',
    type: 'STDIO',
    source: 'PLUGGEDIN',
    category: 'database',
    tags: ['sql', 'db'],
    sharedBy: 'alice',
    originalServerUuid: '22222222-2222-4222-8222-222222222222',
    repository_url: 'https://github.com/acme/pg-mcp',
    command: 'npx',
    args: ['-y', '@acme/pg-mcp'],
    env: { DATABASE_URL: `postgres://alice:${PW}@db.example.com/app` },
    // Everything below is not part of an install recipe.
    oauth_token: TOKEN,
    session_id: TOKEN,
    oauth: { client_secret: TOKEN },
    config: { apiKey: TOKEN },
    env_encrypted: TOKEN,
    profile_uuid: '33333333-3333-4333-8333-333333333333',
    notes: `private note ${TOKEN}`,
    somethingNew: { nested: { deeper: TOKEN } },
  };

  it('drops every field outside the allowlist', () => {
    const sanitized: any = sanitizeServerTemplate(poisoned);

    for (const field of [
      'oauth_token',
      'session_id',
      'oauth',
      'config',
      'env_encrypted',
      'profile_uuid',
      'notes',
      'somethingNew',
    ]) {
      expect(sanitized).not.toHaveProperty(field);
    }
    expect(JSON.stringify(sanitized)).not.toContain(TOKEN);
    expect(JSON.stringify(sanitized)).not.toContain(PW);
  });

  it('keeps what a listing and an importer read', () => {
    const sanitized: any = sanitizeServerTemplate(poisoned);

    expect(sanitized).toMatchObject({
      uuid: poisoned.uuid,
      name: 'pg',
      description: 'Postgres MCP',
      type: 'STDIO',
      source: 'PLUGGEDIN',
      category: 'database',
      tags: ['sql', 'db'],
      sharedBy: 'alice',
      originalServerUuid: poisoned.originalServerUuid,
      repository_url: 'https://github.com/acme/pg-mcp',
      command: 'npx',
      args: ['-y', '@acme/pg-mcp'],
    });
    expect(Object.keys(sanitized.env)).toEqual(['DATABASE_URL']);
  });

  it('keeps top-level header names but not their values', () => {
    const sanitized: any = sanitizeServerTemplate({ headers: { Cookie: `sid=${TOKEN}` } });

    expect(Object.keys(sanitized.headers)).toEqual(['Cookie']);
    expect(JSON.stringify(sanitized)).not.toContain(TOKEN);
  });

  it('drops an object smuggled into a descriptive field', () => {
    const sanitized: any = sanitizeServerTemplate({ name: 'x', description: { secret: TOKEN } });

    expect(sanitized.name).toBe('x');
    expect(sanitized).not.toHaveProperty('description');
  });

  it('reduces an env list to the names it needs, without values', () => {
    const sanitized: any = sanitizeServerTemplate({ env: [`API_KEY=${TOKEN}`, 'PLAIN_NAME'] });

    expect(JSON.stringify(sanitized)).not.toContain(TOKEN);
    expect(Object.keys(sanitized.env)).toEqual(['API_KEY', 'PLAIN_NAME']);
  });

  it('redacts credentials inside custom instructions', () => {
    const sanitized: any = sanitizeServerTemplate({
      customInstructions: [
        { role: 'system', content: `Connect with postgres://alice:${PW}@db.example.com/app` },
      ],
    });

    expect(JSON.stringify(sanitized)).not.toContain(PW);
    expect(sanitized.customInstructions[0].role).toBe('system');
  });

  it('is idempotent and does not mutate its input', () => {
    const input = JSON.parse(JSON.stringify(poisoned));
    const once = sanitizeServerTemplate(input);

    expect(sanitizeServerTemplate(once)).toEqual(once);
    expect(input).toEqual(poisoned);
  });
});

describe('sanitizeCollectionContent', () => {
  it('redacts a database password carried in a server argument', () => {
    const content = {
      servers: [
        {
          name: 'pg',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-postgres', `postgres://alice:${PW}@db.example.com/app`],
        },
      ],
    };

    expect(JSON.stringify(sanitizeCollectionContent(content))).not.toContain(PW);
  });

  it('redacts credentials in fields beside the server list', () => {
    const content = {
      servers: [],
      meta: { apiKey: TOKEN, link: `redis://default:${PW}@cache.example.com:6379` },
    };

    const serialized = JSON.stringify(sanitizeCollectionContent(content));
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(PW);
  });
});
