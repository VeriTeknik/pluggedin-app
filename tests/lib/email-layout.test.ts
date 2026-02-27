/**
 * Tests for email layout utilities
 * Covers HTML escaping for XSS prevention in email templates
 */

import { describe, expect, it } from 'vitest';

import {
  createActionButton,
  createProviderList,
  createSecurityInfoBox,
  createWarningBox,
  escapeHtml,
} from '@/lib/email-layout';

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('should escape less-than and greater-than', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('a "quoted" value')).toBe('a &quot;quoted&quot; value');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("O'Hara")).toBe('O&#39;Hara');
  });

  it('should treat pre-escaped entities as plain text (no special handling)', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('should handle undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should pass through safe strings unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('should handle all special characters together', () => {
    expect(escapeHtml('<div class="test" data-val=\'a&b\'>')).toBe(
      '&lt;div class=&quot;test&quot; data-val=&#39;a&amp;b&#39;&gt;'
    );
  });
});

describe('createSecurityInfoBox', () => {
  it('should escape ipAddress and userAgent', () => {
    const html = createSecurityInfoBox(
      '<script>alert(1)</script>',
      '"><img src=x onerror=alert(1)>',
      new Date('2025-01-01T00:00:00Z')
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });
});

describe('createWarningBox', () => {
  it('should escape message content', () => {
    const html = createWarningBox('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('createActionButton', () => {
  it('should escape button text', () => {
    const html = createActionButton('https://example.com', '<b>Click</b>');
    expect(html).not.toContain('<b>Click</b>');
    expect(html).toContain('&lt;b&gt;Click&lt;/b&gt;');
  });

  it('should escape URL in href attribute', () => {
    const html = createActionButton('https://example.com/a"b', 'Click');
    expect(html).toContain('href="https://example.com/a&quot;b"');
  });

  it('should block javascript: URIs', () => {
    const html = createActionButton('javascript:alert(1)', 'Click');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('should allow https URLs', () => {
    const html = createActionButton('https://plugged.in/settings', 'Settings');
    expect(html).toContain('href="https://plugged.in/settings"');
  });

  it('should allow http URLs', () => {
    const html = createActionButton('http://localhost:3000', 'Dev');
    expect(html).toContain('href="http://localhost:3000"');
  });
});

describe('createProviderList', () => {
  it('should escape provider names', () => {
    const html = createProviderList(['GitHub', '<script>XSS</script>']);
    expect(html).toContain('GitHub');
    expect(html).not.toContain('<script>XSS</script>');
    expect(html).toContain('&lt;script&gt;XSS&lt;/script&gt;');
  });
});
