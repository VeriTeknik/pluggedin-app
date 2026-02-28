import { describe, expect, it } from 'vitest';

import { splitTextIntoChunks } from '@/lib/rag/chunking';

describe('splitTextIntoChunks', () => {
  it('should split text into chunks of specified size', () => {
    const text = 'A'.repeat(2000);
    const chunks = splitTextIntoChunks(text, { chunkSize: 800, chunkOverlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(800 * 1.2); // Allow 20% overflow for overlap
    });
  });

  it('should not split short text', () => {
    const text = 'Hello, this is a short text.';
    const chunks = splitTextIntoChunks(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('should return empty array for empty text', () => {
    expect(splitTextIntoChunks('')).toHaveLength(0);
    expect(splitTextIntoChunks('   ')).toHaveLength(0);
  });

  it('should split on paragraph boundaries first', () => {
    const text = 'Paragraph one content here.\n\nParagraph two content here.\n\nParagraph three content here.';
    const chunks = splitTextIntoChunks(text, { chunkSize: 40, chunkOverlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should use default parameters', () => {
    const text = 'A'.repeat(2000);
    const chunks = splitTextIntoChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
