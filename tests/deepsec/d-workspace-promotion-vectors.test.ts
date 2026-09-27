import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  promoteWorkspacesToHubs,
  rollbackWorkspacePromotion,
  vectorResyncInstructions,
} from '@/lib/db/workspace-promotion';

/**
 * Promotion moves a Workspace's documents to a new Hub by rewriting
 * docs.project_uuid and document_chunks.project_uuid. The vectors in zvec keep
 * their own copy of the old project_uuid, and RAG retrieval filters vectors by
 * Hub and then loads chunk text by chunk uuid alone - so after promotion the
 * OLD Hub's API keys still retrieved text that now belongs to the new Hub.
 *
 * zvec cannot be rewritten from inside the promotion transaction (it is a
 * separate single-writer store, usually locked by the running app), so the
 * transaction severs the stale vectors instead: chunks that change Hub get a
 * new uuid, and a vector still labelled with the old Hub resolves to nothing.
 * The affected Hubs are reported so the operator can re-embed them.
 *
 * No database here: the executor records the statements and answers the
 * reads promotion makes.
 */

const OLD_HUB = '11111111-1111-4111-8111-111111111111';
const NEW_HUB = '22222222-2222-4222-8222-222222222222';
const SECONDARY = '33333333-3333-4333-8333-333333333333';
const PRIMARY = '44444444-4444-4444-8444-444444444444';

const dialect = new PgDialect();

type Statement = { text: string; params: unknown[] };

function fakeDb(respond: (text: string) => unknown[]) {
  const statements: Statement[] = [];
  const tx = {
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      statements.push({ text, params });
      return { rows: respond(text) };
    },
  };
  const db = { ...tx, transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { db: db as any, statements };
}

function chunkUpdates(statements: Statement[]) {
  return statements.filter((s) => /UPDATE\s+document_chunks/i.test(s.text));
}

describe('promoteWorkspacesToHubs', () => {
  function promotionDb() {
    return fakeDb((text) => {
      if (/information_schema\.columns/.test(text)) return [{ table_name: 'docs' }];
      if (/WITH primary_profile/.test(text)) {
        return [
          { uuid: SECONDARY, name: 'Second', project_uuid: OLD_HUB, user_id: 'u1', hub_name: 'Hub', used: 2 },
        ];
      }
      if (/SELECT \* FROM profiles/.test(text)) return [{ uuid: SECONDARY }];
      if (/SELECT active_profile_uuid FROM projects/.test(text)) return [{ active_profile_uuid: PRIMARY }];
      if (/INSERT INTO projects/.test(text)) return [{ uuid: NEW_HUB }];
      if (/UPDATE docs/.test(text)) return [{ uuid: 'doc-1' }];
      if (/UPDATE\s+document_chunks/.test(text)) return [{ uuid: 'chunk-1' }, { uuid: 'chunk-2' }];
      return [];
    });
  }

  it('gives every chunk that changes Hub a new uuid, so stale vectors resolve to nothing', async () => {
    const { db, statements } = promotionDb();

    await promoteWorkspacesToHubs(db);

    const updates = chunkUpdates(statements);
    expect(updates).toHaveLength(1);
    expect(updates[0].text).toMatch(/\buuid\s*=\s*gen_random_uuid\(\)/i);
    expect(updates[0].params).toContain(NEW_HUB);
  });

  it('reports the Hubs whose documents need re-embedding', async () => {
    const { db } = promotionDb();

    const result = await promoteWorkspacesToHubs(db);

    expect(result.chunksRealigned).toBe(2);
    expect(result.hubsToReindex).toEqual([NEW_HUB]);
  });
});

describe('rollbackWorkspacePromotion', () => {
  function rollbackDb() {
    return fakeDb((text) => {
      if (/FROM workspace_promotions ORDER BY/.test(text)) {
        return [
          {
            profile_uuid: SECONDARY,
            action: 'promoted',
            from_project_uuid: OLD_HUB,
            to_project_uuid: NEW_HUB,
            from_project_active_profile_uuid: PRIMARY,
            profile_snapshot: {},
          },
        ];
      }
      if (/UPDATE\s+document_chunks/.test(text)) return [{ uuid: 'chunk-3' }];
      if (/DELETE FROM projects/.test(text)) return [{ uuid: NEW_HUB }];
      return [];
    });
  }

  it('severs the vectors labelled with the Hub the chunks are leaving', async () => {
    const { db, statements } = rollbackDb();

    await rollbackWorkspacePromotion(db);

    const updates = chunkUpdates(statements);
    expect(updates).toHaveLength(1);
    expect(updates[0].text).toMatch(/\buuid\s*=\s*gen_random_uuid\(\)/i);
    expect(updates[0].params).toContain(OLD_HUB);
  });

  it('reports the Hub the documents went back to as needing re-embedding', async () => {
    const { db } = rollbackDb();

    const result = await rollbackWorkspacePromotion(db);

    expect(result.hubsToReindex).toEqual([OLD_HUB]);
  });
});

describe('vectorResyncInstructions', () => {
  it('says nothing when no chunk changed Hub', () => {
    expect(vectorResyncInstructions([])).toEqual([]);
  });

  it('names every affected Hub and the command that rebuilds the index', () => {
    const lines = vectorResyncInstructions([NEW_HUB, OLD_HUB]).join('\n');

    expect(lines).toContain('pnpm reindex:rag');
    expect(lines).toContain(NEW_HUB);
    expect(lines).toContain(OLD_HUB);
  });
});
