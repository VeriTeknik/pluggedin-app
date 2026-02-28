import { describe, expect, it } from 'vitest';

import { documentChunksTable } from '@/db/schema';

describe('documentChunksTable schema', () => {
  it('should export the table', () => {
    expect(documentChunksTable).toBeDefined();
  });

  it('should have the correct table name', () => {
    // Drizzle tables have a Symbol for table name
    const tableName = (documentChunksTable as any)[Symbol.for('drizzle:Name')];
    expect(tableName).toBe('document_chunks');
  });
});
