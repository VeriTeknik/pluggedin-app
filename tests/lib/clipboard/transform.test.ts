/**
 * Tests for clipboard transform utilities
 */

import { describe, expect, it } from 'vitest';

import { isTextLikeEntry } from '@/lib/clipboard/client';

describe('isTextLikeEntry', () => {
  describe('text content types', () => {
    it('should return true for text/* content types', () => {
      expect(isTextLikeEntry({ contentType: 'text/plain' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'text/html' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'text/css' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'text/javascript' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'text/markdown' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'text/csv' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'text/xml' })).toBe(true);
    });
  });

  describe('application content types', () => {
    it('should return true for application/json', () => {
      expect(isTextLikeEntry({ contentType: 'application/json' })).toBe(true);
    });

    it('should return true for application/xml', () => {
      expect(isTextLikeEntry({ contentType: 'application/xml' })).toBe(true);
    });

    it('should return true for application/xhtml+xml', () => {
      expect(isTextLikeEntry({ contentType: 'application/xhtml+xml' })).toBe(true);
    });

    it('should return false for other application types by default', () => {
      expect(isTextLikeEntry({ contentType: 'application/octet-stream' })).toBe(false);
      expect(isTextLikeEntry({ contentType: 'application/pdf' })).toBe(false);
      expect(isTextLikeEntry({ contentType: 'application/zip' })).toBe(false);
    });
  });

  describe('image content types', () => {
    it('should return false for image/* content types', () => {
      expect(isTextLikeEntry({ contentType: 'image/png' })).toBe(false);
      expect(isTextLikeEntry({ contentType: 'image/jpeg' })).toBe(false);
      expect(isTextLikeEntry({ contentType: 'image/gif' })).toBe(false);
      expect(isTextLikeEntry({ contentType: 'image/webp' })).toBe(false);
      expect(isTextLikeEntry({ contentType: 'image/svg+xml' })).toBe(false);
    });
  });

  describe('encoding-based detection', () => {
    it('should return true when encoding is utf-8', () => {
      expect(isTextLikeEntry({ contentType: 'application/octet-stream', encoding: 'utf-8' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'image/png', encoding: 'utf-8' })).toBe(true);
    });

    it('should return true when encoding is utf8 (without hyphen)', () => {
      expect(isTextLikeEntry({ contentType: 'application/octet-stream', encoding: 'utf8' })).toBe(true);
    });

    it('should be case-insensitive for encoding', () => {
      expect(isTextLikeEntry({ contentType: 'application/octet-stream', encoding: 'UTF-8' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'application/octet-stream', encoding: 'UTF8' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'application/octet-stream', encoding: 'Utf-8' })).toBe(true);
    });

    it('should return false for base64 encoding with non-text types', () => {
      expect(isTextLikeEntry({ contentType: 'image/png', encoding: 'base64' })).toBe(false);
      expect(isTextLikeEntry({ contentType: 'application/octet-stream', encoding: 'base64' })).toBe(false);
    });

    it('should return false for hex encoding with non-text types', () => {
      expect(isTextLikeEntry({ contentType: 'image/png', encoding: 'hex' })).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content type', () => {
      expect(isTextLikeEntry({ contentType: '' })).toBe(false);
    });

    it('should handle undefined encoding', () => {
      expect(isTextLikeEntry({ contentType: 'text/plain', encoding: undefined })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'image/png', encoding: undefined })).toBe(false);
    });

    it('should handle missing encoding property', () => {
      expect(isTextLikeEntry({ contentType: 'text/plain' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'image/png' })).toBe(false);
    });

    it('should prioritize content type for text types regardless of encoding', () => {
      // Text types are always text-like even with base64 encoding
      expect(isTextLikeEntry({ contentType: 'text/plain', encoding: 'base64' })).toBe(true);
      expect(isTextLikeEntry({ contentType: 'application/json', encoding: 'base64' })).toBe(true);
    });
  });

  describe('real-world scenarios', () => {
    it('should correctly identify JSON API response', () => {
      expect(isTextLikeEntry({
        contentType: 'application/json',
        encoding: 'utf-8',
      })).toBe(true);
    });

    it('should correctly identify base64 image', () => {
      expect(isTextLikeEntry({
        contentType: 'image/png',
        encoding: 'base64',
      })).toBe(false);
    });

    it('should correctly identify plain text file', () => {
      expect(isTextLikeEntry({
        contentType: 'text/plain',
        encoding: 'utf-8',
      })).toBe(true);
    });

    it('should correctly identify binary file', () => {
      expect(isTextLikeEntry({
        contentType: 'application/octet-stream',
        encoding: 'base64',
      })).toBe(false);
    });

    it('should correctly identify HTML content', () => {
      expect(isTextLikeEntry({
        contentType: 'text/html',
        encoding: 'utf-8',
      })).toBe(true);
    });

    it('should correctly identify Markdown', () => {
      expect(isTextLikeEntry({
        contentType: 'text/markdown',
      })).toBe(true);
    });
  });
});
