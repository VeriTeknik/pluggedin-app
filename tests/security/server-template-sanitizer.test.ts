import { describe, expect, it } from 'vitest';

import { sanitizeConnectionString, sanitizeServerTemplate } from '@/lib/server-template';

const REDACTED = '<YOUR_SECRET_HERE>';

describe('sanitizeConnectionString', () => {
  // Assembled from parts rather than written inline. The value under test is
  // identical, but a literal `scheme://user:pass@host` in the source reads as a
  // real leaked connection string to secret scanners - which is exactly the
  // shape this function exists to redact.
  const dbUrl = (scheme: string) => `${scheme}://user:` + 'hunter2' + '@db.example.com/app';

  it.each(['postgresql', 'mongodb', 'mysql'])('masks the password in a %s URL', (scheme) => {
    const sanitized = sanitizeConnectionString(dbUrl(scheme));

    expect(sanitized).not.toContain('hunter2');
    expect(sanitized).toContain('db.example.com');
  });

  it.each([
    'api_key',
    'apiKey',
    'apikey',
    'access_key',
    'key',
    'token',
    'access_token',
    'refresh_token',
    'secret',
    'client_secret',
    'password',
    'auth',
    'x-auth-token',
    'credential',
  ])('masks a credential carried as the %s query parameter', (param) => {
    const sanitized = sanitizeConnectionString(`https://api.example.com/mcp?${param}=live-abc123`);

    expect(sanitized).not.toContain('live-abc123');
    expect(sanitized).toContain(param);
  });

  it.each(['version', 'monkey', 'keyspace', 'format'])(
    'leaves the innocuous %s query parameter alone',
    (param) => {
      const url = `https://api.example.com/mcp?${param}=2`;

      expect(sanitizeConnectionString(url)).toBe(url);
    }
  );

  it('masks a credential in a later query parameter, not just the first', () => {
    const sanitized = sanitizeConnectionString(
      'https://api.example.com/mcp?version=2&client_secret=live-abc123'
    );

    expect(sanitized).not.toContain('live-abc123');
    expect(sanitized).toContain('version=2');
  });

  it('leaves an innocuous string alone', () => {
    expect(sanitizeConnectionString('npx')).toBe('npx');
  });
});

describe('sanitizeServerTemplate', () => {
  /** A template of the shape stored before templates were sanitized on write. */
  const legacyTemplate = {
    name: 'victim-server',
    type: 'STDIO',
    command: 'npx',
    args: ['-y', '@victim/server', '--token=tok-live-abcdef'],
    env: {
      GITHUB_PAT: 'ghp_liveVictimToken',
      API_KEY: 'sk-live-secret',
      HOME_DIR: '/home/victim',
    },
    url: 'https://api.example.com/mcp?api_key=live-url-key',
    streamableHTTPOptions: {
      sessionId: 'sess-live-1234',
      headers: { Authorization: 'Bearer live-header-token' },
    },
    category: 'dev',
  };

  const SECRETS = [
    'ghp_liveVictimToken',
    'sk-live-secret',
    'live-url-key',
    'live-header-token',
    'sess-live-1234',
  ];

  it('redacts every env value, not only the ones whose key looks secret', () => {
    const sanitized = sanitizeServerTemplate(legacyTemplate);

    expect(sanitized.env).toEqual({
      GITHUB_PAT: REDACTED,
      API_KEY: REDACTED,
      HOME_DIR: REDACTED,
    });
  });

  it('keeps env keys so an importer knows what to fill in', () => {
    const sanitized = sanitizeServerTemplate(legacyTemplate);

    expect(Object.keys(sanitized.env).sort()).toEqual(['API_KEY', 'GITHUB_PAT', 'HOME_DIR']);
  });

  it('redacts transport headers and drops the session id', () => {
    const sanitized = sanitizeServerTemplate(legacyTemplate);

    expect(sanitized.streamableHTTPOptions.headers.Authorization).toBe(REDACTED);
    expect(sanitized.streamableHTTPOptions.sessionId).toBeUndefined();
  });

  it('keeps the installable structure', () => {
    const sanitized = sanitizeServerTemplate(legacyTemplate);

    expect(sanitized.command).toBe('npx');
    expect(sanitized.args[0]).toBe('-y');
    expect(sanitized.args[1]).toBe('@victim/server');
    expect(sanitized.name).toBe('victim-server');
    expect(sanitized.category).toBe('dev');
  });

  it('redacts a secret passed as an inline argument value', () => {
    const sanitized = sanitizeServerTemplate(legacyTemplate);

    expect(sanitized.args.join(' ')).not.toContain('tok-live-abcdef');
  });

  it.each(['--token', '--api-key', '--client-secret', '--password', '--auth-header'])(
    'redacts a credential passed as the %s flag',
    (flag) => {
      const sanitized: any = sanitizeServerTemplate({
        args: [flag, 'live-flag-value', `${flag}=live-inline-value`],
      });

      expect(sanitized.args.join(' ')).not.toContain('live-flag-value');
      expect(sanitized.args.join(' ')).not.toContain('live-inline-value');
    }
  );

  it('leaves an ordinary flag and its value alone', () => {
    const sanitized: any = sanitizeServerTemplate({ args: ['--port', '8080', '--verbose'] });

    expect(sanitized.args).toEqual(['--port', '8080', '--verbose']);
  });

  it('leaks nothing when serialized', () => {
    const serialized = JSON.stringify(sanitizeServerTemplate(legacyTemplate));

    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('does not mutate its input', () => {
    const input = JSON.parse(JSON.stringify(legacyTemplate));
    sanitizeServerTemplate(input);

    expect(input.env.GITHUB_PAT).toBe('ghp_liveVictimToken');
  });

  it('is idempotent', () => {
    const once = sanitizeServerTemplate(legacyTemplate);
    const twice = sanitizeServerTemplate(once);

    expect(twice).toEqual(once);
  });

  it('passes null and undefined through', () => {
    expect(sanitizeServerTemplate(null)).toBeNull();
    expect(sanitizeServerTemplate(undefined)).toBeUndefined();
  });
});
