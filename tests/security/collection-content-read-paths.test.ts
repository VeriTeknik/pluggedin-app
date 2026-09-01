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
  it('every query whose row is returned is sanitized', () => {
    // Checking the file as a whole would let a new unsanitized read into
    // app/actions/social.ts pass, because that file already mentions the
    // sanitizer for its other paths. Each query site is judged on its own
    // enclosing top-level block instead, and only the ones that hand the row
    // back need the sanitizer.
    const QUERY = /(?:const|let)\s+(\w+)\s*=\s*await\s+db\.query\.sharedCollectionsTable\.find\w*\(/g;

    const offenders: string[] = [];

    for (const file of ['app', 'lib'].flatMap((dir) => walk(dir))) {
      const src = fs.readFileSync(file, 'utf8');
      if (!/db\.query\.sharedCollectionsTable\.find/.test(src)) continue;

      // Top-level declarations start at column 0 and end at a `}` in column 0.
      for (const block of src.split(/\n(?=})/)) {
        for (const m of block.matchAll(QUERY)) {
          const variable = m[1];
          const after = block.slice(m.index ?? 0);

          // Does this block hand the queried row back to its caller?
          const returned = new RegExp(`return[^;]*\\b${variable}\\b`, 's').test(after);
          if (!returned) continue;

          if (!/sanitizeCollectionContent/.test(after)) {
            offenders.push(`${file}#${variable}`);
          }
        }
      }
    }

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
