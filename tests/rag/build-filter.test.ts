import { describe, expect, it } from 'vitest';

import { buildFilter } from '@/lib/vectors/vector-service';

describe('buildFilter', () => {
  // ─── Valid inputs ────────────────────────────────────────────────

  it('should build a single UUID field filter', () => {
    const result = buildFilter([['project_uuid', '123e4567-e89b-12d3-a456-426614174000']]);
    expect(result).toBe('project_uuid = "123e4567-e89b-12d3-a456-426614174000"');
  });

  it('should build multiple UUID field filters with AND', () => {
    const result = buildFilter([
      ['project_uuid', '123e4567-e89b-12d3-a456-426614174000'],
      ['document_uuid', 'abcdef01-2345-6789-abcd-ef0123456789'],
    ]);
    expect(result).toContain('project_uuid = "123e4567-e89b-12d3-a456-426614174000"');
    expect(result).toContain('AND');
    expect(result).toContain('document_uuid = "abcdef01-2345-6789-abcd-ef0123456789"');
  });

  it('should accept valid string fields (ring_type, pattern_type)', () => {
    const result = buildFilter([['ring_type', 'procedures']]);
    expect(result).toBe('ring_type = "procedures"');
  });

  it('should accept alphanumeric string field values with hyphens and underscores', () => {
    expect(buildFilter([['pattern_type', 'tool_sequence']])).toBe('pattern_type = "tool_sequence"');
    expect(buildFilter([['pattern_type', 'error-recovery']])).toBe('pattern_type = "error-recovery"');
  });

  it('should skip null conditions', () => {
    const result = buildFilter([
      ['project_uuid', '123e4567-e89b-12d3-a456-426614174000'],
      null,
    ]);
    expect(result).toBe('project_uuid = "123e4567-e89b-12d3-a456-426614174000"');
  });

  it('should skip conditions with empty values', () => {
    const result = buildFilter([
      ['project_uuid', '123e4567-e89b-12d3-a456-426614174000'],
      ['document_uuid', ''],
    ]);
    expect(result).toBe('project_uuid = "123e4567-e89b-12d3-a456-426614174000"');
  });

  it('should return undefined when all conditions are null or empty', () => {
    expect(buildFilter([null])).toBeUndefined();
    expect(buildFilter([['project_uuid', '']])).toBeUndefined();
    expect(buildFilter([])).toBeUndefined();
  });

  // ─── Injection prevention ────────────────────────────────────────

  it('should reject disallowed field names', () => {
    expect(() => buildFilter([['malicious_field', 'value']])).toThrow('Invalid filter field');
  });

  it('should reject SQL injection in field names', () => {
    expect(() => buildFilter([['project_uuid; DROP TABLE', '123e4567-e89b-12d3-a456-426614174000']])).toThrow('Invalid filter field');
  });

  it('should reject non-UUID values for UUID fields', () => {
    expect(() => buildFilter([['project_uuid', 'not-a-uuid']])).toThrow('Invalid UUID filter value');
    expect(() => buildFilter([['project_uuid', '"; DROP TABLE users --']])).toThrow('Invalid UUID filter value');
    expect(() => buildFilter([['document_uuid', '../../../etc/passwd']])).toThrow('Invalid UUID filter value');
  });

  it('should reject unsafe characters in string field values', () => {
    expect(() => buildFilter([['ring_type', 'value"; DROP TABLE']])).toThrow('Invalid string filter value');
    expect(() => buildFilter([['pattern_type', 'a b c']])).toThrow('Invalid string filter value');
    expect(() => buildFilter([['ring_type', 'value\ninjection']])).toThrow('Invalid string filter value');
  });

  // ─── All allowed fields accepted ─────────────────────────────────

  it('should accept all defined UUID fields', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    for (const field of ['project_uuid', 'document_uuid', 'chunk_uuid', 'profile_uuid', 'agent_uuid']) {
      expect(() => buildFilter([[field, uuid]])).not.toThrow();
    }
  });

  it('should accept all defined string fields', () => {
    for (const field of ['ring_type', 'pattern_type']) {
      expect(() => buildFilter([[field, 'valid_value']])).not.toThrow();
    }
  });
});
