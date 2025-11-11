/**
 * Tests for validation utilities
 * Covers SSRF and path traversal protection
 */

import { describe, it, expect } from 'vitest';
import { validateExternalId, validateExternalIdWithLogging } from '@/lib/validation-utils';

describe('validateExternalId', () => {
  describe('Valid inputs', () => {
    it('should accept alphanumeric characters', () => {
      expect(validateExternalId('server123')).toBe(true);
      expect(validateExternalId('MyServer456')).toBe(true);
      expect(validateExternalId('ABC123def789')).toBe(true);
    });

    it('should accept hyphens', () => {
      expect(validateExternalId('my-server')).toBe(true);
      expect(validateExternalId('my-server-123')).toBe(true);
      expect(validateExternalId('prefix-middle-suffix')).toBe(true);
    });

    it('should accept underscores', () => {
      expect(validateExternalId('my_server')).toBe(true);
      expect(validateExternalId('my_server_123')).toBe(true);
      expect(validateExternalId('prefix_middle_suffix')).toBe(true);
    });

    it('should accept single dots (for domains/versions)', () => {
      expect(validateExternalId('server.name')).toBe(true);
      expect(validateExternalId('my.server.v2')).toBe(true);
      expect(validateExternalId('com.example.server')).toBe(true);
    });

    it('should accept mixed valid characters', () => {
      expect(validateExternalId('my-server_v2.3')).toBe(true);
      expect(validateExternalId('Server-Name_123.beta')).toBe(true);
      expect(validateExternalId('com.company-name.server_v1')).toBe(true);
    });
  });

  describe('Invalid inputs - Path traversal', () => {
    it('should reject double dots (path traversal)', () => {
      expect(validateExternalId('..')).toBe(false);
      expect(validateExternalId('../etc/passwd')).toBe(false);
      expect(validateExternalId('../../etc/passwd')).toBe(false);
      expect(validateExternalId('../../../etc/passwd')).toBe(false);
    });

    it('should reject paths with double dots in the middle', () => {
      expect(validateExternalId('path/../file')).toBe(false);
      expect(validateExternalId('foo..bar')).toBe(false);
      expect(validateExternalId('server..config')).toBe(false);
    });

    it('should reject forward slashes', () => {
      expect(validateExternalId('path/to/file')).toBe(false);
      expect(validateExternalId('/etc/passwd')).toBe(false);
      expect(validateExternalId('server/config')).toBe(false);
      expect(validateExternalId('/')).toBe(false);
    });

    it('should reject backslashes', () => {
      expect(validateExternalId('path\\to\\file')).toBe(false);
      expect(validateExternalId('C:\\Windows\\System32')).toBe(false);
      expect(validateExternalId('server\\config')).toBe(false);
      expect(validateExternalId('\\')).toBe(false);
    });

    it('should reject mixed slash types', () => {
      expect(validateExternalId('path/to\\file')).toBe(false);
      expect(validateExternalId('..\\..\\etc/passwd')).toBe(false);
    });
  });

  describe('Invalid inputs - Special characters', () => {
    it('should reject spaces', () => {
      expect(validateExternalId('my server')).toBe(false);
      expect(validateExternalId('server 123')).toBe(false);
      expect(validateExternalId(' server')).toBe(false);
      expect(validateExternalId('server ')).toBe(false);
    });

    it('should reject special characters', () => {
      expect(validateExternalId('server@name')).toBe(false);
      expect(validateExternalId('server#123')).toBe(false);
      expect(validateExternalId('server$name')).toBe(false);
      expect(validateExternalId('server%20')).toBe(false);
      expect(validateExternalId('server&name')).toBe(false);
      expect(validateExternalId('server*name')).toBe(false);
    });

    it('should reject parentheses and brackets', () => {
      expect(validateExternalId('server(1)')).toBe(false);
      expect(validateExternalId('server[123]')).toBe(false);
      expect(validateExternalId('server{config}')).toBe(false);
    });

    it('should reject quotes', () => {
      expect(validateExternalId('server"name"')).toBe(false);
      expect(validateExternalId("server'name'")).toBe(false);
      expect(validateExternalId('server`name`')).toBe(false);
    });

    it('should reject angle brackets (potential XSS)', () => {
      expect(validateExternalId('<script>')).toBe(false);
      expect(validateExternalId('server<tag>')).toBe(false);
      expect(validateExternalId('server>name')).toBe(false);
    });
  });

  describe('Invalid inputs - Empty/null', () => {
    it('should reject null', () => {
      expect(validateExternalId(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateExternalId(undefined)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateExternalId('')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long valid strings', () => {
      const longId = 'a'.repeat(1000);
      expect(validateExternalId(longId)).toBe(true);
    });

    it('should reject strings starting with special chars', () => {
      expect(validateExternalId('.hidden')).toBe(true); // Single dot is OK
      expect(validateExternalId('..hidden')).toBe(false); // Double dot not OK
      expect(validateExternalId('-server')).toBe(true); // Hyphen is OK
      expect(validateExternalId('_server')).toBe(true); // Underscore is OK
    });

    it('should reject unicode and non-ASCII characters', () => {
      expect(validateExternalId('server™')).toBe(false);
      expect(validateExternalId('café')).toBe(false);
      expect(validateExternalId('日本語')).toBe(false);
      expect(validateExternalId('🚀rocket')).toBe(false);
    });

    it('should reject newlines and control characters', () => {
      expect(validateExternalId('server\nname')).toBe(false);
      expect(validateExternalId('server\rname')).toBe(false);
      expect(validateExternalId('server\tname')).toBe(false);
      expect(validateExternalId('server\0name')).toBe(false);
    });
  });

  describe('Real-world MCP server IDs', () => {
    it('should accept typical registry IDs', () => {
      expect(validateExternalId('filesystem')).toBe(true);
      expect(validateExternalId('brave-search')).toBe(true);
      expect(validateExternalId('github-mcp-server')).toBe(true);
      expect(validateExternalId('postgres_db')).toBe(true);
      expect(validateExternalId('server.v2')).toBe(true);
    });
  });
});

describe('validateExternalIdWithLogging', () => {
  it('should return same results as validateExternalId', () => {
    // Valid cases
    expect(validateExternalIdWithLogging('valid-server', 'test')).toBe(true);
    expect(validateExternalIdWithLogging('server.name', 'test')).toBe(true);

    // Invalid cases
    expect(validateExternalIdWithLogging('../etc/passwd', 'test')).toBe(false);
    expect(validateExternalIdWithLogging('server/path', 'test')).toBe(false);
    expect(validateExternalIdWithLogging('', 'test')).toBe(false);
    expect(validateExternalIdWithLogging(null, 'test')).toBe(false);
  });

  it('should accept custom context for logging', () => {
    // Just verify it doesn't throw with different contexts
    expect(validateExternalIdWithLogging('valid', 'reviews')).toBe(true);
    expect(validateExternalIdWithLogging('valid', 'server-fetch')).toBe(true);
    expect(validateExternalIdWithLogging('valid', 'custom-context')).toBe(true);
  });
});
