import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RAG retrieval and removal have to stay inside one Hub even when the vector
 * index disagrees with PostgreSQL.
 *
 * Vectors in zvec carry their own copy of project_uuid. queryForResponse
 * filtered vectors by Hub and then loaded chunk text and document names by
 * uuid alone, so a vector with a stale label - a document moved between Hubs,
 * or any other drift - returned another Hub's text. removeDocument ignored its
 * Hub argument and deleted by document uuid alone, so any caller holding a
 * foreign document uuid erased that Hub's index.
 *
 * The store below evaluates the predicates the service builds, so these
 * assertions are about which rows come back or disappear, not about how the
 * query was spelled.
 */

const HUB_A = '11111111-1111-4111-8111-111111111111';
const HUB_B = '22222222-2222-4222-8222-222222222222';
const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHUNK_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CHUNK_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

const store = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  vectors: [] as Array<{ id: string; fields: Record<string, string> }>,
}));

function matchesFilter(filter: string | undefined) {
  const conditions: Array<[string, string]> = filter ? JSON.parse(filter) : [];
  return (vector: { fields: Record<string, string> }) =>
    conditions.every(([field, value]) => vector.fields[field] === value);
}

vi.mock('drizzle-orm', () => ({
  eq: (column: string, value: unknown): Predicate => (row) => row[column] === value,
  inArray: (column: string, values: unknown[]): Predicate => (row) => values.includes(row[column]),
  and: (...predicates: Array<Predicate | undefined>): Predicate => (row) =>
    predicates.every((p) => !p || p(row)),
  isNotNull: (column: string): Predicate => (row) => row[column] != null,
  sql: () => ({}),
}));
vi.mock('@/db/schema', () => ({
  documentChunksTable: {
    __name: 'document_chunks',
    uuid: 'uuid',
    chunk_text: 'chunk_text',
    document_uuid: 'document_uuid',
    project_uuid: 'project_uuid',
  },
  docsTable: {
    __name: 'docs',
    uuid: 'uuid',
    name: 'name',
    rag_document_id: 'rag_document_id',
    project_uuid: 'project_uuid',
  },
}));
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: (table: { __name: string }) => ({
        where: (predicate: Predicate) => {
          const rows = store.tables[table.__name].filter(predicate);
          return Object.assign(Promise.resolve(rows), {
            limit: async (n: number) => rows.slice(0, n),
          });
        },
      }),
    }),
    delete: (table: { __name: string }) => ({
      where: async (predicate: Predicate) => {
        store.tables[table.__name] = store.tables[table.__name].filter((row) => !predicate(row));
      },
    }),
  },
}));
vi.mock('@/lib/vectors/vector-service', () => ({
  // Same contract as the real one: empty values drop out, and no conditions
  // at all means no filter - an unfiltered search across every Hub.
  buildFilter: (conditions: Array<[string, string] | null>) => {
    const kept = conditions.filter((c): c is [string, string] => c !== null && c[1] !== '');
    return kept.length > 0 ? JSON.stringify(kept) : undefined;
  },
  searchVectors: ({ filter }: { filter?: string }) =>
    store.vectors.filter(matchesFilter(filter)).map((v) => ({ id: v.id, score: 1, fields: v.fields })),
  deleteVectorsByFilter: ({ filter }: { filter: string }) => {
    store.vectors = store.vectors.filter((v) => !matchesFilter(filter)(v));
  },
  upsertVectors: vi.fn(),
}));
vi.mock('@/lib/vectors/embedding-service', () => ({
  generateEmbedding: async () => [0.1],
  generateEmbeddings: async () => [[0.1]],
}));

const { RagService } = await import('@/lib/rag-service');

let service: InstanceType<typeof RagService>;

beforeEach(() => {
  process.env.ENABLE_RAG = 'true';
  service = new RagService();
  store.tables = {
    docs: [
      { uuid: DOC_A, name: 'hub-a-notes.md', project_uuid: HUB_A },
      { uuid: DOC_B, name: 'hub-b-secrets.md', project_uuid: HUB_B },
    ],
    document_chunks: [
      { uuid: CHUNK_A, document_uuid: DOC_A, project_uuid: HUB_A, chunk_text: 'alpha text' },
      { uuid: CHUNK_B, document_uuid: DOC_B, project_uuid: HUB_B, chunk_text: 'beta secret text' },
    ],
  };
  store.vectors = [
    { id: `${DOC_A}-0`, fields: { project_uuid: HUB_A, document_uuid: DOC_A, chunk_uuid: CHUNK_A } },
    // Document B now lives in Hub B, but this vector still says Hub A.
    { id: `${DOC_B}-0-stale`, fields: { project_uuid: HUB_A, document_uuid: DOC_B, chunk_uuid: CHUNK_B } },
    { id: `${DOC_B}-0`, fields: { project_uuid: HUB_B, document_uuid: DOC_B, chunk_uuid: CHUNK_B } },
  ];
});

describe('queryForResponse', () => {
  it('never returns another Hub’s text through a stale vector label', async () => {
    const result = await service.queryForResponse(HUB_A, 'anything');

    expect(result.success).toBe(true);
    expect(result.context).toContain('alpha text');
    expect(result.context).not.toContain('beta secret text');
    expect(result.sources).toEqual(['hub-a-notes.md']);
    expect(result.documentIds).toEqual([DOC_A]);
  });

  it('refuses to search without a Hub instead of searching every Hub', async () => {
    const result = await service.queryForResponse('', 'anything');

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('removeDocument', () => {
  it('removes a document’s chunks and vectors inside the named Hub', async () => {
    const result = await service.removeDocument(DOC_A, HUB_A);

    expect(result.success).toBe(true);
    expect(store.tables.document_chunks.map((c) => c.uuid)).toEqual([CHUNK_B]);
    expect(store.vectors.some((v) => v.fields.document_uuid === DOC_A)).toBe(false);
  });

  it('leaves another Hub’s chunks and vectors alone when handed its document uuid', async () => {
    await service.removeDocument(DOC_B, HUB_A);

    expect(store.tables.document_chunks.map((c) => c.uuid)).toContain(CHUNK_B);
    expect(store.vectors.map((v) => v.id)).toContain(`${DOC_B}-0`);
  });

  it('removes nothing without a Hub', async () => {
    const result = await service.removeDocument(DOC_A, '');

    expect(result.success).toBe(false);
    expect(store.tables.document_chunks).toHaveLength(2);
    expect(store.vectors).toHaveLength(3);
  });
});

describe('hasIndexedChunks', () => {
  it('reports chunks for the document in its own Hub only', async () => {
    await expect(service.hasIndexedChunks(DOC_A, HUB_A)).resolves.toBe(true);
    await expect(service.hasIndexedChunks(DOC_B, HUB_A)).resolves.toBe(false);
    await expect(service.hasIndexedChunks(DOC_A, '')).resolves.toBe(false);
  });
});
