/**
 * Tests for clipboard constants and utility functions
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_CLIPBOARD_SIZE_BYTES,
  DEFAULT_CLIPBOARD_TTL_MS,
  calculateClipboardSize,
  validateClipboardSize,
  calculateExpirationDate,
} from '@/lib/clipboard/constants';

describe('Clipboard Constants', () => {
  describe('MAX_CLIPBOARD_SIZE_BYTES', () => {
    it('should be 256KB (262144 bytes)', () => {
      expect(MAX_CLIPBOARD_SIZE_BYTES).toBe(262_144);
      expect(MAX_CLIPBOARD_SIZE_BYTES).toBe(256 * 1024);
    });
  });

  describe('DEFAULT_CLIPBOARD_TTL_MS', () => {
    it('should be 24 hours in milliseconds', () => {
      expect(DEFAULT_CLIPBOARD_TTL_MS).toBe(24 * 60 * 60 * 1000);
      expect(DEFAULT_CLIPBOARD_TTL_MS).toBe(86_400_000);
    });
  });
});

describe('calculateClipboardSize', () => {
  it('should calculate size of ASCII string correctly', () => {
    expect(calculateClipboardSize('hello')).toBe(5);
    expect(calculateClipboardSize('')).toBe(0);
    expect(calculateClipboardSize('a'.repeat(100))).toBe(100);
  });

  it('should calculate size of UTF-8 multibyte characters', () => {
    // Each emoji is 4 bytes in UTF-8
    expect(calculateClipboardSize('👍')).toBe(4);
    expect(calculateClipboardSize('👍👍')).toBe(8);

    // Chinese characters are 3 bytes each
    expect(calculateClipboardSize('你好')).toBe(6);

    // Mix of ASCII and multibyte
    expect(calculateClipboardSize('Hello 世界')).toBe(12); // 6 ASCII + 6 for 2 Chinese chars
  });

  it('should measure encoded string size (not decoded payload)', () => {
    // Base64 encoded content - we measure the string size, not decoded
    const base64Content = 'SGVsbG8gV29ybGQ='; // "Hello World" in base64
    expect(calculateClipboardSize(base64Content, 'base64')).toBe(16);
  });

  it('should handle encoding parameter (always uses UTF-8 measurement)', () => {
    const value = 'test data';
    // All encodings use the same UTF-8 byte measurement
    expect(calculateClipboardSize(value, 'utf-8')).toBe(9);
    expect(calculateClipboardSize(value, 'base64')).toBe(9);
    expect(calculateClipboardSize(value, 'hex')).toBe(9);
  });
});

describe('validateClipboardSize', () => {
  it('should return null for valid sizes', () => {
    expect(validateClipboardSize('hello')).toBeNull();
    expect(validateClipboardSize('')).toBeNull();
    expect(validateClipboardSize('a'.repeat(1000))).toBeNull();
  });

  it('should return null for content at exactly the limit', () => {
    // Create a string that's exactly at the limit
    const exactLimitContent = 'a'.repeat(MAX_CLIPBOARD_SIZE_BYTES);
    expect(validateClipboardSize(exactLimitContent)).toBeNull();
  });

  it('should return error message for content exceeding limit', () => {
    const oversizedContent = 'a'.repeat(MAX_CLIPBOARD_SIZE_BYTES + 1);
    const result = validateClipboardSize(oversizedContent);

    expect(result).not.toBeNull();
    expect(result).toContain('exceeds maximum size');
    expect(result).toContain('262144 bytes');
    expect(result).toContain('256KB');
  });

  it('should handle large content correctly', () => {
    // Content that's 300KB (exceeds 256KB limit)
    const largeContent = 'a'.repeat(300 * 1024);
    const result = validateClipboardSize(largeContent);

    expect(result).not.toBeNull();
    expect(result).toContain('exceeds maximum size');
  });
});

describe('calculateExpirationDate', () => {
  it('should use default TTL when no seconds provided', () => {
    const before = Date.now();
    const expiration = calculateExpirationDate();
    const after = Date.now();

    const expirationTime = expiration.getTime();
    const expectedMin = before + DEFAULT_CLIPBOARD_TTL_MS;
    const expectedMax = after + DEFAULT_CLIPBOARD_TTL_MS;

    expect(expirationTime).toBeGreaterThanOrEqual(expectedMin);
    expect(expirationTime).toBeLessThanOrEqual(expectedMax);
  });

  it('should use default TTL when undefined is passed', () => {
    const before = Date.now();
    const expiration = calculateExpirationDate(undefined);
    const after = Date.now();

    const expirationTime = expiration.getTime();
    expect(expirationTime).toBeGreaterThanOrEqual(before + DEFAULT_CLIPBOARD_TTL_MS);
    expect(expirationTime).toBeLessThanOrEqual(after + DEFAULT_CLIPBOARD_TTL_MS);
  });

  it('should calculate expiration from custom TTL in seconds', () => {
    const ttlSeconds = 3600; // 1 hour
    const before = Date.now();
    const expiration = calculateExpirationDate(ttlSeconds);
    const after = Date.now();

    const expirationTime = expiration.getTime();
    const expectedMin = before + ttlSeconds * 1000;
    const expectedMax = after + ttlSeconds * 1000;

    expect(expirationTime).toBeGreaterThanOrEqual(expectedMin);
    expect(expirationTime).toBeLessThanOrEqual(expectedMax);
  });

  it('should handle short TTL (1 minute)', () => {
    const ttlSeconds = 60;
    const before = Date.now();
    const expiration = calculateExpirationDate(ttlSeconds);

    const expirationTime = expiration.getTime();
    expect(expirationTime).toBeGreaterThanOrEqual(before + 60_000);
    expect(expirationTime).toBeLessThanOrEqual(before + 60_000 + 100); // Allow 100ms tolerance
  });

  it('should handle long TTL (30 days)', () => {
    const ttlSeconds = 30 * 24 * 60 * 60; // 30 days
    const before = Date.now();
    const expiration = calculateExpirationDate(ttlSeconds);

    const expirationTime = expiration.getTime();
    expect(expirationTime).toBeGreaterThanOrEqual(before + ttlSeconds * 1000);
  });

  it('should return a Date object', () => {
    const expiration = calculateExpirationDate();
    expect(expiration).toBeInstanceOf(Date);
  });
});
