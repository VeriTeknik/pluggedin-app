import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/auth/callback/registry/route';
import { NextRequest } from 'next/server';

describe('XSS Prevention in Registry OAuth Callback', () => {
  it('should properly escape URLs in error responses', async () => {
    // Test with XSS attempt in error parameter
    const xssUrl = 'http://localhost:3000/api/auth/callback/registry?error=<script>alert("XSS")</script>';
    const request = new NextRequest(xssUrl);
    
    const response = await GET(request);
    const html = await response.text();
    
    // Verify script tags are escaped
    expect(html).not.toContain('<script>alert("XSS")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
  });

  it('should properly encode baseUrl in all responses', async () => {
    // Mock environment with potentially malicious URL
    const originalUrl = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = 'http://localhost:3000/<script>alert("XSS")</script>';
    
    const request = new NextRequest('http://localhost:3000/api/auth/callback/registry?error=test');
    const response = await GET(request);
    const html = await response.text();
    
    // Verify URL is properly encoded
    expect(html).not.toContain('<script>alert("XSS")</script>');
    expect(html).toContain(encodeURIComponent('http://localhost:3000/<script>alert("XSS")</script>'));
    
    // Restore environment
    process.env.NEXTAUTH_URL = originalUrl;
  });

  it('should escape error messages in postMessage calls', async () => {
    const xssError = 'Token exchange failed: <img src=x onerror=alert("XSS")>';
    const request = new NextRequest(`http://localhost:3000/api/auth/callback/registry?error=${encodeURIComponent(xssError)}`);
    
    const response = await GET(request);
    const html = await response.text();
    
    // Verify error message is escaped in postMessage
    expect(html).not.toContain('<img src=x onerror=alert("XSS")>');
    expect(html).toContain(encodeURIComponent(xssError));
  });
});