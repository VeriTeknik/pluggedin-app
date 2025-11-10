/**
 * Tests for HTTP metrics path normalization
 * Ensures metrics don't have high cardinality
 */

import { describe, it, expect } from 'vitest';
import { normalizePath } from '@/lib/observability/http-metrics';

describe('normalizePath', () => {
  describe('UUID normalization', () => {
    it('should normalize standard UUIDs', () => {
      expect(normalizePath('/api/servers/123e4567-e89b-12d3-a456-426614174000'))
        .toBe('/api/servers/:uuid');

      expect(normalizePath('/api/users/550e8400-e29b-41d4-a716-446655440000'))
        .toBe('/api/users/:uuid');
    });

    it('should normalize multiple UUIDs in path', () => {
      expect(normalizePath('/api/users/123e4567-e89b-12d3-a456-426614174000/servers/550e8400-e29b-41d4-a716-446655440000'))
        .toBe('/api/users/:uuid/servers/:uuid');
    });

    it('should handle mixed case UUIDs', () => {
      expect(normalizePath('/api/servers/ABC12345-6789-ABCD-EF01-234567890ABC'))
        .toBe('/api/servers/:uuid');
    });
  });

  describe('Numeric ID normalization', () => {
    it('should normalize single digit IDs', () => {
      expect(normalizePath('/api/users/1')).toBe('/api/users/:id');
      expect(normalizePath('/api/servers/9')).toBe('/api/servers/:id');
    });

    it('should normalize multi-digit IDs', () => {
      expect(normalizePath('/api/users/12345')).toBe('/api/users/:id');
      expect(normalizePath('/api/servers/999999')).toBe('/api/servers/:id');
    });

    it('should normalize very long numeric IDs', () => {
      expect(normalizePath('/api/users/123456789012345678'))
        .toBe('/api/users/:id');
    });

    it('should normalize multiple numeric IDs', () => {
      expect(normalizePath('/api/users/123/servers/456'))
        .toBe('/api/users/:id/servers/:id');
    });
  });

  describe('Username normalization', () => {
    it('should normalize username paths', () => {
      expect(normalizePath('/to/john_doe')).toBe('/to/:username');
      expect(normalizePath('/to/jane-smith')).toBe('/to/:username');
      expect(normalizePath('/to/user123')).toBe('/to/:username');
    });

    it('should normalize username with subpaths', () => {
      expect(normalizePath('/to/john_doe/servers'))
        .toBe('/to/:username/servers');

      expect(normalizePath('/to/jane-smith/collections'))
        .toBe('/to/:username/collections');
    });

    it('should only match /to/ prefix', () => {
      // Should not match usernames in other paths
      expect(normalizePath('/api/users/john_doe'))
        .not.toContain(':username');
    });
  });

  describe('API version normalization', () => {
    it('should normalize major versions', () => {
      expect(normalizePath('/api/v1/users')).toBe('/api/:version/users');
      expect(normalizePath('/api/v2/servers')).toBe('/api/:version/servers');
      expect(normalizePath('/v1/health')).toBe('/:version/health');
    });

    it('should normalize semantic versions', () => {
      expect(normalizePath('/api/v1.0/users')).toBe('/api/:version/users');
      expect(normalizePath('/api/v2.3/servers')).toBe('/api/:version/servers');
      expect(normalizePath('/v10.5/health')).toBe('/:version/health');
    });

    it('should normalize versions at various positions', () => {
      expect(normalizePath('/v2/api/users')).toBe('/:version/api/users');
      expect(normalizePath('/api/v3/auth/login')).toBe('/api/:version/auth/login');
    });
  });

  describe('Locale normalization', () => {
    it('should normalize supported locale paths', () => {
      expect(normalizePath('/en/settings')).toBe('/:locale/settings');
      expect(normalizePath('/tr/ayarlar')).toBe('/:locale/ayarlar');
      expect(normalizePath('/zh/settings')).toBe('/:locale/settings');
      expect(normalizePath('/hi/settings')).toBe('/:locale/settings');
      expect(normalizePath('/ja/settings')).toBe('/:locale/settings');
      expect(normalizePath('/nl/settings')).toBe('/:locale/settings');
    });

    it('should not normalize unsupported locales', () => {
      expect(normalizePath('/fr/settings')).not.toContain(':locale');
      expect(normalizePath('/de/settings')).not.toContain(':locale');
      expect(normalizePath('/es/settings')).not.toContain(':locale');
    });

    it('should normalize locale with subpaths', () => {
      expect(normalizePath('/en/dashboard/analytics'))
        .toBe('/:locale/dashboard/analytics');
    });

    it('should only match locale at start of path', () => {
      // Should not match locale codes in middle of path
      expect(normalizePath('/api/en/users')).not.toContain(':locale');
    });
  });

  describe('Token normalization', () => {
    it('should normalize JWT tokens (mixed alphanumeric, 32+ chars)', () => {
      // JWT tokens are typically very long mixed alphanumeric strings
      expect(normalizePath('/auth/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
        .toBe('/auth/:token');

      // 32+ char mixed alphanumeric
      expect(normalizePath('/verify/ABC123XYZ456789012345678abcdefgh'))
        .toBe('/verify/:token');
    });

    it('should normalize Base64 tokens with padding', () => {
      // 18+ chars before padding (=)
      expect(normalizePath('/reset/abcdefgh1234567890=='))  // 18 chars + ==
        .toBe('/reset/:token');

      expect(normalizePath('/verify/sometoken1234567890='))  // 19 chars + =
        .toBe('/verify/:token');
    });

    it('should require minimum 32 characters for mixed alphanumeric tokens', () => {
      // Less than 32 chars should not be considered a token
      expect(normalizePath('/api/users/ABC123'))
        .not.toContain(':token');

      // 27 chars - should not match
      expect(normalizePath('/api/users/ABC123XYZ456789012345678'))
        .not.toContain(':token');

      // Exactly 32 chars with mixed alphanumeric should match
      expect(normalizePath('/api/users/ABC123XYZ456789012345678901234AB'))  // 32 chars
        .toBe('/api/users/:token');

      // Another 32+ char example
      expect(normalizePath('/api/users/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'))  // 32 chars
        .toBe('/api/users/:token');
    });

    it('should not match pure letter strings', () => {
      // Pure letters should not match token pattern
      expect(normalizePath('/auth/verylongstringwithoutnumbersbutlongenough'))
        .not.toContain(':token');
    });
  });

  describe('Hash normalization', () => {
    it('should normalize MD5 hashes (32 chars)', () => {
      expect(normalizePath('/files/5d41402abc4b2a76b9719d911017c592'))
        .toBe('/files/:hash');
    });

    it('should normalize SHA256 hashes (64 chars)', () => {
      expect(normalizePath('/files/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'))
        .toBe('/files/:hash');
    });

    it('should handle mixed case hashes', () => {
      expect(normalizePath('/files/5D41402ABC4B2A76B9719D911017C592'))
        .toBe('/files/:hash');

      expect(normalizePath('/files/E3B0C44298FC1C149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'))
        .toBe('/files/:hash');
    });
  });

  describe('Query parameter handling', () => {
    it('should remove query parameters', () => {
      expect(normalizePath('/api/users?page=1&limit=10'))
        .toBe('/api/users');

      expect(normalizePath('/api/users/123?include=profile'))
        .toBe('/api/users/:id');
    });

    it('should normalize path before removing query params', () => {
      expect(normalizePath('/api/users/123?page=1'))
        .toBe('/api/users/:id');

      expect(normalizePath('/to/john_doe?tab=servers'))
        .toBe('/to/:username');
    });

    it('should handle empty query parameters', () => {
      expect(normalizePath('/api/users?')).toBe('/api/users');
      expect(normalizePath('/api/users/?')).toBe('/api/users/');
    });
  });

  describe('Combined patterns', () => {
    it('should normalize locale with UUID', () => {
      expect(normalizePath('/en/servers/123e4567-e89b-12d3-a456-426614174000'))
        .toBe('/:locale/servers/:uuid');
    });

    it('should normalize API version with numeric ID', () => {
      expect(normalizePath('/api/v2/users/12345'))
        .toBe('/api/:version/users/:id');
    });

    it('should normalize multiple patterns in order', () => {
      expect(normalizePath('/en/api/v2/users/123e4567-e89b-12d3-a456-426614174000/servers/456'))
        .toBe('/:locale/api/:version/users/:uuid/servers/:id');
    });

    it('should handle username with numeric ID subpath', () => {
      expect(normalizePath('/to/john_doe/servers/123'))
        .toBe('/to/:username/servers/:id');
    });
  });

  describe('Static paths (should not be normalized)', () => {
    it('should preserve API route paths', () => {
      expect(normalizePath('/api/health')).toBe('/api/health');
      expect(normalizePath('/api/metrics')).toBe('/api/metrics');
      expect(normalizePath('/api/auth/login')).toBe('/api/auth/login');
    });

    it('should preserve page routes', () => {
      expect(normalizePath('/dashboard')).toBe('/dashboard');
      expect(normalizePath('/settings')).toBe('/settings');
      expect(normalizePath('/analytics')).toBe('/analytics');
    });

    it('should preserve nested static routes', () => {
      expect(normalizePath('/api/mcp/servers')).toBe('/api/mcp/servers');
      expect(normalizePath('/dashboard/analytics')).toBe('/dashboard/analytics');
    });
  });

  describe('Edge cases', () => {
    it('should handle root path', () => {
      expect(normalizePath('/')).toBe('/');
    });

    it('should handle empty string', () => {
      expect(normalizePath('')).toBe('');
    });

    it('should handle paths without leading slash', () => {
      expect(normalizePath('api/users/123')).toBe('api/users/:id');
    });

    it('should handle trailing slashes', () => {
      expect(normalizePath('/api/users/123/'))
        .toBe('/api/users/:id/');
    });

    it('should limit very long paths', () => {
      const longPath = '/api/' + 'segment/'.repeat(50);
      const normalized = normalizePath(longPath);
      expect(normalized.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(normalized.endsWith('...')).toBe(true);
    });
  });

  describe('Pattern order (specificity)', () => {
    it('should match locale before username pattern', () => {
      // /en/ should match locale, not be passed to other patterns
      expect(normalizePath('/en')).toBe('/:locale');
      expect(normalizePath('/en/')).toBe('/:locale/');
    });

    it('should match hash before numeric ID', () => {
      // 32+ hex chars should match hash, not numeric ID
      expect(normalizePath('/files/5d41402abc4b2a76b9719d911017c592'))
        .toBe('/files/:hash');
    });

    it('should match token before numeric ID', () => {
      // 32+ mixed alphanumeric should match token, not numeric ID
      expect(normalizePath('/verify/ABC123XYZ456789012345678abcdefgh'))  // 36 chars, mixed
        .toBe('/verify/:token');
    });
  });

  describe('Real-world paths', () => {
    it('should normalize typical API paths', () => {
      expect(normalizePath('/api/users/12345/profile'))
        .toBe('/api/users/:id/profile');

      expect(normalizePath('/api/servers/550e8400-e29b-41d4-a716-446655440000/tools'))
        .toBe('/api/servers/:uuid/tools');

      expect(normalizePath('/api/v1/documents/987/versions'))
        .toBe('/api/:version/documents/:id/versions');
    });

    it('should normalize localized paths', () => {
      expect(normalizePath('/tr/dashboard/analytics'))
        .toBe('/:locale/dashboard/analytics');

      expect(normalizePath('/en/settings/profile'))
        .toBe('/:locale/settings/profile');
    });

    it('should normalize auth paths', () => {
      expect(normalizePath('/auth/reset/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
        .toBe('/auth/reset/:token');

      expect(normalizePath('/verify/ABC123XYZ456789012345678abcdefgh'))  // 36 chars, mixed
        .toBe('/verify/:token');
    });
  });
});
