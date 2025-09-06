import { describe, expect, test } from 'vitest';
import { 
  validateExternalUrl, 
  validateInternalUrl, 
  sanitizeUrl,
  isTrustedRegistryUrl 
} from '@/lib/url-validator';

describe('URL Validator Security Tests', () => {
  describe('validateExternalUrl - SSRF Prevention', () => {
    describe('Private IP Range Blocking', () => {
      test('blocks 10.x.x.x range', () => {
        expect(() => validateExternalUrl('http://10.0.0.1')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('http://10.255.255.255')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('https://10.1.2.3:8080/path')).toThrow('Private IP address not allowed');
      });

      test('blocks 172.16-31.x.x range', () => {
        expect(() => validateExternalUrl('http://172.16.0.1')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('http://172.20.0.1')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('http://172.31.255.255')).toThrow('Private IP address not allowed');
        // Should allow 172.32.x.x (public)
        expect(() => validateExternalUrl('http://172.32.0.1')).toThrow('Domain not allowed');
      });

      test('blocks 192.168.x.x range', () => {
        expect(() => validateExternalUrl('http://192.168.1.1')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('http://192.168.0.1')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('https://192.168.255.255')).toThrow('Private IP address not allowed');
      });

      test('blocks 169.254.x.x link-local range', () => {
        expect(() => validateExternalUrl('http://169.254.1.1')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('http://169.254.169.254')).toThrow('Private IP address not allowed');
      });

      test('blocks loopback addresses', () => {
        expect(() => validateExternalUrl('http://127.0.0.1')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('http://127.0.0.2')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('http://127.255.255.255')).toThrow('Private IP address not allowed');
      });

      test('blocks multicast and reserved ranges', () => {
        expect(() => validateExternalUrl('http://224.0.0.1')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('http://240.0.0.1')).toThrow('Private IP address not allowed');
        expect(() => validateExternalUrl('http://0.0.0.0')).toThrow('Private IP address not allowed');
      });
    });

    describe('IPv6 Support', () => {
      test('blocks IPv6 loopback', () => {
        expect(() => validateExternalUrl('http://[::1]')).toThrow('Private IPv6 address not allowed');
        expect(() => validateExternalUrl('http://[0000:0000:0000:0000:0000:0000:0000:0001]')).toThrow('Private IPv6 address not allowed');
      });

      test('blocks IPv6 link-local', () => {
        expect(() => validateExternalUrl('http://[fe80::1]')).toThrow('Private IPv6 address not allowed');
        expect(() => validateExternalUrl('http://[fe80::1234:5678:90ab:cdef]')).toThrow('Private IPv6 address not allowed');
      });

      test('blocks IPv6 unique local', () => {
        expect(() => validateExternalUrl('http://[fc00::1]')).toThrow('Private IPv6 address not allowed');
        expect(() => validateExternalUrl('http://[fd00::1]')).toThrow('Private IPv6 address not allowed');
      });
    });

    describe('Domain Allowlisting', () => {
      test('allows trusted domains', () => {
        const github = validateExternalUrl('https://github.com/user/repo');
        expect(github.hostname).toBe('github.com');
        
        const apiGithub = validateExternalUrl('https://api.github.com/repos');
        expect(apiGithub.hostname).toBe('api.github.com');
        
        const registry = validateExternalUrl('https://registry.plugged.in/v0');
        expect(registry.hostname).toBe('registry.plugged.in');
        
        const staging = validateExternalUrl('https://staging.plugged.in/v0');
        expect(staging.hostname).toBe('staging.plugged.in');
      });

      test('allows subdomains of trusted domains', () => {
        const subdomain = validateExternalUrl('https://api.registry.plugged.in/v1');
        expect(subdomain.hostname).toBe('api.registry.plugged.in');
      });

      test('blocks non-allowed domains', () => {
        expect(() => validateExternalUrl('https://evil.com')).toThrow('Domain not allowed');
        expect(() => validateExternalUrl('https://malicious.site')).toThrow('Domain not allowed');
        expect(() => validateExternalUrl('https://google.com')).toThrow('Domain not allowed');
      });

      test('blocks domain variations', () => {
        expect(() => validateExternalUrl('https://github.com.evil.com')).toThrow('Domain not allowed');
        expect(() => validateExternalUrl('https://fakegithub.com')).toThrow('Domain not allowed');
        expect(() => validateExternalUrl('https://github-com.fake')).toThrow('Domain not allowed');
      });
    });

    describe('Authentication Credential Blocking', () => {
      test('blocks URLs with username and password', () => {
        // gitguardian:ignore - Fake credentials for security testing
        expect(() => validateExternalUrl('https://user:pass@github.com')).toThrow('URLs with authentication credentials are not allowed');
        // gitguardian:ignore - Fake credentials for security testing
        expect(() => validateExternalUrl('https://admin:secret@api.github.com')).toThrow('URLs with authentication credentials are not allowed');
      });

      test('blocks URLs with only username', () => {
        // gitguardian:ignore - Fake username for security testing
        expect(() => validateExternalUrl('https://user@github.com')).toThrow('URLs with authentication credentials are not allowed');
      });

      test('blocks URLs with only password', () => {
        // gitguardian:ignore - Fake password for security testing
        expect(() => validateExternalUrl('https://:password@github.com')).toThrow('URLs with authentication credentials are not allowed');
      });

      test('blocks encoded credentials', () => {
        // gitguardian:ignore - Test with fake encoded credentials to verify blocking
        // These are intentionally fake credentials (user@name:pass@word) used to test
        // that our validator correctly blocks URLs containing authentication data
        expect(() => validateExternalUrl('https://user%40name:pass%40word@github.com')).toThrow('URLs with authentication credentials are not allowed');
      });
    });

    describe('Protocol Validation', () => {
      test('allows HTTP and HTTPS', () => {
        expect(validateExternalUrl('https://github.com').protocol).toBe('https:');
        expect(validateExternalUrl('http://registry.plugged.in').protocol).toBe('http:');
      });

      test('blocks non-HTTP protocols', () => {
        expect(() => validateExternalUrl('ftp://github.com')).toThrow('Invalid protocol');
        expect(() => validateExternalUrl('file:///etc/passwd')).toThrow('Invalid protocol');
        expect(() => validateExternalUrl('javascript:alert(1)')).toThrow('Invalid protocol');
        expect(() => validateExternalUrl('data:text/html,<script>alert(1)</script>')).toThrow('Invalid protocol');
      });
    });

    describe('Null Byte and Special Character Handling', () => {
      test('blocks URLs with null bytes', () => {
        expect(() => validateExternalUrl('https://github.com/path%00')).toThrow('URLs with null bytes are not allowed');
        expect(() => validateExternalUrl('https://github.com/path\0')).toThrow('URLs with null bytes are not allowed');
      });

      test('handles URLs with special characters', () => {
        const url = validateExternalUrl('https://github.com/path?query=value&foo=bar#fragment');
        expect(url.pathname).toBe('/path');
        expect(url.search).toBe('?query=value&foo=bar');
      });
    });

    describe('Localhost Handling', () => {
      test('blocks localhost in production', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        
        expect(() => validateExternalUrl('http://localhost')).toThrow('Domain not allowed');
        expect(() => validateExternalUrl('http://127.0.0.1')).toThrow('Private IP address not allowed');
        
        process.env.NODE_ENV = originalEnv;
      });

      test('allows localhost in development by default', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        
        const localhost = validateExternalUrl('http://localhost:8000');
        expect(localhost.hostname).toBe('localhost');
        
        const loopback = validateExternalUrl('http://127.0.0.1:3000');
        expect(loopback.hostname).toBe('127.0.0.1');
        
        process.env.NODE_ENV = originalEnv;
      });

      test('allows localhost when explicitly enabled', () => {
        const localhost = validateExternalUrl('http://localhost:8000', { allowLocalhost: true });
        expect(localhost.hostname).toBe('localhost');
        
        const loopback = validateExternalUrl('http://127.0.0.1:3000', { allowLocalhost: true });
        expect(loopback.hostname).toBe('127.0.0.1');
      });
    });

    describe('Custom Domain Lists', () => {
      test('uses custom allowed domains', () => {
        const customDomains = ['example.com', 'test.org'];
        const url = validateExternalUrl('https://example.com/path', { allowedDomains: customDomains });
        expect(url.hostname).toBe('example.com');
        
        expect(() => validateExternalUrl('https://github.com', { allowedDomains: customDomains }))
          .toThrow('Domain not allowed');
      });
    });
  });

  describe('validateInternalUrl', () => {
    test('only allows registry and staging domains', () => {
      const registry = validateInternalUrl('https://registry.plugged.in/v0/servers');
      expect(registry.hostname).toBe('registry.plugged.in');
      
      const apiRegistry = validateInternalUrl('https://api.registry.plugged.in/v1');
      expect(apiRegistry.hostname).toBe('api.registry.plugged.in');
      
      const staging = validateInternalUrl('https://staging.plugged.in/v0/servers');
      expect(staging.hostname).toBe('staging.plugged.in');
      
      const apiStaging = validateInternalUrl('https://api.staging.plugged.in/v1');
      expect(apiStaging.hostname).toBe('api.staging.plugged.in');
    });

    test('blocks other domains', () => {
      expect(() => validateInternalUrl('https://github.com')).toThrow('Domain not allowed');
      expect(() => validateInternalUrl('https://npmjs.org')).toThrow('Domain not allowed');
    });

    test('allows localhost in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const localhost = validateInternalUrl('http://localhost:8000/api');
      expect(localhost.hostname).toBe('localhost');
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('sanitizeUrl', () => {
    test('removes credentials from URLs', () => {
      const sanitized = sanitizeUrl('https://user:pass@github.com/path');
      expect(sanitized).toBe('https://github.com/path');
      expect(sanitized).not.toContain('user');
      expect(sanitized).not.toContain('pass');
    });

    test('removes hash from URLs', () => {
      const sanitized = sanitizeUrl('https://github.com/path#section');
      expect(sanitized).toBe('https://github.com/path');
      expect(sanitized).not.toContain('#section');
    });

    test('returns null for invalid URLs', () => {
      expect(sanitizeUrl('not a url')).toBeNull();
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
      expect(sanitizeUrl('')).toBeNull();
    });

    test('preserves query parameters', () => {
      const sanitized = sanitizeUrl('https://github.com/path?foo=bar&baz=qux');
      expect(sanitized).toBe('https://github.com/path?foo=bar&baz=qux');
    });
  });

  describe('isTrustedRegistryUrl', () => {
    test('identifies trusted registry URLs', () => {
      expect(isTrustedRegistryUrl('https://registry.plugged.in/v0')).toBe(true);
      expect(isTrustedRegistryUrl('https://smithery.ai/server')).toBe(true);
      expect(isTrustedRegistryUrl('https://github.com/repo')).toBe(true);
      expect(isTrustedRegistryUrl('https://npmjs.org/package')).toBe(true);
      expect(isTrustedRegistryUrl('https://pypi.org/project')).toBe(true);
    });

    test('rejects untrusted URLs', () => {
      expect(isTrustedRegistryUrl('https://evil.com')).toBe(false);
      expect(isTrustedRegistryUrl('https://fake-registry.com')).toBe(false);
    });

    test('handles invalid URLs', () => {
      expect(isTrustedRegistryUrl('not a url')).toBe(false);
      expect(isTrustedRegistryUrl('')).toBe(false);
    });
  });

  describe('Edge Cases and Attack Vectors', () => {
    test('handles URL encoding attacks', () => {
      expect(() => validateExternalUrl('https://github.com%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toThrow();
      expect(() => validateExternalUrl('https://192%2e168%2e1%2e1')).toThrow();
    });

    test('handles DNS rebinding attempts', () => {
      // These should be blocked as they're not in allowed domains
      expect(() => validateExternalUrl('http://1.1.1.1')).toThrow('Domain not allowed');
      expect(() => validateExternalUrl('http://8.8.8.8')).toThrow('Domain not allowed');
    });

    test('handles redirect chains', () => {
      // URL validator should only validate the initial URL
      const url = validateExternalUrl('https://github.com/redirect');
      expect(url.hostname).toBe('github.com');
      // Actual redirect following would be handled by fetch
    });

    test('handles very long URLs', () => {
      const longPath = 'a'.repeat(10000);
      const url = validateExternalUrl(`https://github.com/${longPath}`);
      expect(url.hostname).toBe('github.com');
      expect(url.pathname.length).toBeGreaterThan(9000);
    });

    test('handles internationalized domain names', () => {
      // IDN domains should be handled by URL constructor
      expect(() => validateExternalUrl('https://xn--e1afmkfd.xn--p1ai')).toThrow('Domain not allowed');
    });
  });

  describe('Performance Considerations', () => {
    test('validates URLs quickly', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        validateExternalUrl('https://github.com/test/path');
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // Should validate 1000 URLs in under 100ms
    });
  });
});