import { describe, it, expect } from 'vitest';
import { validateYouTubeUrl, getSafeYouTubeUrl } from '@/lib/video-url-validator';

describe('validateYouTubeUrl', () => {
  describe('Valid URLs', () => {
    it('should validate basic YouTube embed URL', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should validate YouTube embed URL with start parameter', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/WFe3rb6JtQw?start=141');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe('https://www.youtube.com/embed/WFe3rb6JtQw?start=141');
    });

    it('should validate YouTube embed URL with multiple valid parameters', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/WFe3rb6JtQw?start=141&autoplay=1&mute=1');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toContain('start=141');
      expect(result.sanitizedUrl).toContain('autoplay=1');
      expect(result.sanitizedUrl).toContain('mute=1');
    });

    it('should validate YouTube nocookie domain', () => {
      const result = validateYouTubeUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('should validate youtube.com without www', () => {
      const result = validateYouTubeUrl('https://youtube.com/embed/dQw4w9WgXcQ');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe('https://youtube.com/embed/dQw4w9WgXcQ');
    });
  });

  describe('Invalid URLs - XSS Attacks', () => {
    it('should reject javascript: URLs', () => {
      const result = validateYouTubeUrl('javascript:alert(1)');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid URL scheme');
    });

    it('should reject data: URLs', () => {
      const result = validateYouTubeUrl('data:text/html,<script>alert(1)</script>');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid URL scheme');
    });

    it('should reject vbscript: URLs', () => {
      const result = validateYouTubeUrl('vbscript:msgbox');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid URL scheme');
    });
  });

  describe('Invalid URLs - Wrong Domain', () => {
    it('should reject non-YouTube domains', () => {
      const result = validateYouTubeUrl('https://evil.com/embed/dQw4w9WgXcQ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Domain must be one of');
    });

    it('should reject YouTube-like domains', () => {
      const result = validateYouTubeUrl('https://www.youtube.com.evil.com/embed/dQw4w9WgXcQ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Domain must be one of');
    });
  });

  describe('Invalid URLs - Wrong Protocol', () => {
    it('should reject HTTP URLs', () => {
      const result = validateYouTubeUrl('http://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Only HTTPS protocol is allowed');
    });

    it('should reject FTP URLs', () => {
      const result = validateYouTubeUrl('ftp://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Only HTTPS protocol is allowed');
    });
  });

  describe('Invalid URLs - Wrong Path', () => {
    it('should reject YouTube watch URLs', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('URL must be in format: /embed/VIDEO_ID');
    });

    it('should reject short YouTube URLs', () => {
      const result = validateYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Domain must be one of');
    });

    it('should reject URLs without /embed/ path', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/v/dQw4w9WgXcQ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('URL must be in format: /embed/VIDEO_ID');
    });
  });

  describe('Invalid URLs - Invalid Video ID', () => {
    it('should reject video IDs that are too short', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/short');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid YouTube video ID format');
    });

    it('should reject video IDs that are too long', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/toolongvideoid123');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid YouTube video ID format');
    });

    it('should reject video IDs with invalid characters', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/invalid@#$%');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('URL must be in format: /embed/VIDEO_ID');
    });
  });

  describe('Query Parameter Sanitization', () => {
    it('should sanitize and keep only allowed parameters', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/WFe3rb6JtQw?start=141&malicious=evil&autoplay=1');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toContain('start=141');
      expect(result.sanitizedUrl).toContain('autoplay=1');
      expect(result.sanitizedUrl).not.toContain('malicious');
    });

    it('should validate numeric parameters', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/WFe3rb6JtQw?start=abc');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).not.toContain('start'); // Invalid value removed
    });

    it('should validate boolean parameters (0 or 1)', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/WFe3rb6JtQw?autoplay=2');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).not.toContain('autoplay'); // Invalid value removed
    });

    it('should reject negative start times', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/embed/WFe3rb6JtQw?start=-10');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).not.toContain('start'); // Negative value removed
    });
  });

  describe('Edge Cases', () => {
    it('should reject empty string', () => {
      const result = validateYouTubeUrl('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('URL is required');
    });

    it('should reject null', () => {
      const result = validateYouTubeUrl(null as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('URL is required');
    });

    it('should reject undefined', () => {
      const result = validateYouTubeUrl(undefined as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('URL is required');
    });

    it('should reject non-string values', () => {
      const result = validateYouTubeUrl(123 as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('URL is required and must be a string');
    });

    it('should handle URLs with whitespace', () => {
      const result = validateYouTubeUrl('  https://www.youtube.com/embed/dQw4w9WgXcQ  ');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });
  });
});

describe('getSafeYouTubeUrl', () => {
  it('should return sanitized URL for valid input', () => {
    const safeUrl = getSafeYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(safeUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('should return fallback for invalid input', () => {
    const fallback = 'https://www.youtube.com/embed/fallback123';
    const safeUrl = getSafeYouTubeUrl('javascript:alert(1)', fallback);
    expect(safeUrl).toBe(fallback);
  });

  it('should return null if no fallback provided for invalid input', () => {
    const safeUrl = getSafeYouTubeUrl('javascript:alert(1)');
    expect(safeUrl).toBeNull();
  });

  it('should sanitize query parameters', () => {
    const safeUrl = getSafeYouTubeUrl('https://www.youtube.com/embed/WFe3rb6JtQw?start=141&malicious=evil');
    expect(safeUrl).toContain('start=141');
    expect(safeUrl).not.toContain('malicious');
  });
});
