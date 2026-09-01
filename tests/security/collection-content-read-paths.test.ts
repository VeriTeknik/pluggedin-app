import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();

vi.mock('@/db', () => ({
  db: { query: { sharedCollectionsTable: { findMany } } },
}));

const poisonedRow = () => ({
  uuid: 'c1',
  title: 'mine',
  is_public: true,
  created_at: new Date('2026-01-01'),
  content: {
    servers: [
      {
        name: 'gh',
        command: 'npx',
        args: ['server', '--token=live-secret'],
        url: 'https://api.example.com/mcp?api_key=live-key',
        env: { GH_PAT: 'ghp_live' },
      },
    ],
  },
  profile: { project: { user: { username: 'someone', name: 'Someone' } } },
});

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([poisonedRow()]);
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

describe('every collection read path sanitizes content', () => {
  /**
   * `content` is stored as the client sent it and carries decrypted
   * command/args/env/url. The scan named two endpoints; there are five reads.
   * This is the check that catches the sixth.
   */
  it('no file queries sharedCollectionsTable without sanitizing', () => {
    const offenders = ['app', 'lib']
      .flatMap((dir) => walk(dir))
      .filter((file) => {
        const src = fs.readFileSync(file, 'utf8');
        return (
          /db\.query\.sharedCollectionsTable\.find/.test(src) &&
          !/sanitizeCollectionContent/.test(src)
        );
      });

    expect(offenders).toEqual([]);
  });

  it('GET /api/collections serves no plaintext credential', async () => {
    const { GET } = await import('@/app/api/collections/route');

    const body = await (await GET()).text();

    expect(body).not.toContain('ghp_live');
    expect(body).not.toContain('live-secret');
    expect(body).not.toContain('live-key');
    expect(body).toContain('gh'); // the server is still listed
  });

  it('GET /api/user/[username]/collections serves no plaintext credential', async () => {
    const { GET } = await import('@/app/api/user/[username]/collections/route');

    const response = await GET({} as never, {
      params: Promise.resolve({ username: 'someone' }),
    } as never);
    const body = await response.text();

    expect(body).not.toContain('ghp_live');
    expect(body).not.toContain('live-secret');
    expect(body).not.toContain('live-key');
  });
});
