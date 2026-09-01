import { describe, expect, it } from 'vitest';

import { sanitizeCollectionContent } from '@/lib/server-template';

/**
 * A shared collection's `content` is client-supplied jsonb: the share dialog
 * builds `{ servers: [...templates] }` from the user's own servers, and those
 * templates are produced by createShareableTemplate, which decrypts
 * command/args/env/url. shareCollection stored whatever arrived and five read
 * paths — two of them unauthenticated — returned it verbatim.
 */
describe('sanitizeCollectionContent', () => {
  const poisoned = {
    servers: [
      {
        name: 'gh',
        command: 'npx',
        args: ['server', '--token=live-secret', '--client-secret', 'another-secret'],
        url: 'https://api.example.com/mcp?api_key=live-key',
        env: { GH_PAT: 'ghp_live', DB_PASS: 'hunter2', HARMLESS: 'plain' },
      },
    ],
  };

  it('redacts every env value, whatever the key is called', () => {
    const { servers } = sanitizeCollectionContent(poisoned) as typeof poisoned;

    expect(Object.keys(servers[0].env)).toEqual(['GH_PAT', 'DB_PASS', 'HARMLESS']);
    expect(Object.values(servers[0].env)).not.toContain('ghp_live');
    expect(Object.values(servers[0].env)).not.toContain('hunter2');
  });

  it('redacts credentials carried in args and the url', () => {
    const out = JSON.stringify(sanitizeCollectionContent(poisoned));

    expect(out).not.toContain('live-secret');
    expect(out).not.toContain('another-secret');
    expect(out).not.toContain('live-key');
  });

  it('keeps the structure an importer needs', () => {
    const { servers } = sanitizeCollectionContent(poisoned) as typeof poisoned;

    expect(servers[0].name).toBe('gh');
    expect(servers[0].command).toBe('npx');
    expect(servers[0].args[0]).toBe('server');
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(poisoned);
    sanitizeCollectionContent(poisoned);

    expect(JSON.stringify(poisoned)).toBe(before);
  });

  it('is idempotent', () => {
    const once = sanitizeCollectionContent(poisoned);
    const twice = sanitizeCollectionContent(once);

    expect(twice).toEqual(once);
  });

  it('passes through content that is not a server list', () => {
    expect(sanitizeCollectionContent(null)).toBeNull();
    expect(sanitizeCollectionContent('text')).toBe('text');
    expect(sanitizeCollectionContent({ note: 'hi' })).toEqual({ note: 'hi' });
    expect(sanitizeCollectionContent({ servers: 'not-an-array' })).toEqual({
      servers: 'not-an-array',
    });
  });
});
