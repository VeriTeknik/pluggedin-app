import { describe, it, expect } from 'vitest';

// Test the refactored URL parsing functions
const determineProviderFromUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    const providerMap: Record<string, string> = {
      'linear.app': 'Linear',
      'github.com': 'GitHub',
      'accounts.google.com': 'Google',
      'google.com': 'Google',
      'slack.com': 'Slack',
      'api.notion.com': 'Notion',
      'notion.so': 'Notion',
      'atlassian.com': 'Jira',
      'atlassian.net': 'Jira'
    };
    
    if (providerMap[hostname]) {
      return providerMap[hostname];
    }
    
    for (const [domain, provider] of Object.entries(providerMap)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return provider;
      }
    }
    
    if (hostname.includes('jira') || parsedUrl.pathname.includes('jira')) {
      return 'Jira';
    }
    if (hostname.includes('confluence') || parsedUrl.pathname.includes('confluence')) {
      return 'Confluence';
    }
  } catch (e) {
    console.error('Invalid URL for provider detection:', e);
  }
  return 'OAuth Provider';
};

describe('URL Parsing Security', () => {
  describe('determineProviderFromUrl', () => {
    it('should correctly identify providers from valid URLs', () => {
      expect(determineProviderFromUrl('https://github.com/login/oauth')).toBe('GitHub');
      expect(determineProviderFromUrl('https://linear.app/oauth/authorize')).toBe('Linear');
      expect(determineProviderFromUrl('https://slack.com/oauth/v2/authorize')).toBe('Slack');
      expect(determineProviderFromUrl('https://accounts.google.com/o/oauth2/v2/auth')).toBe('Google');
    });

    it('should handle subdomains correctly', () => {
      expect(determineProviderFromUrl('https://api.github.com/oauth')).toBe('GitHub');
      expect(determineProviderFromUrl('https://auth.linear.app/oauth')).toBe('Linear');
      expect(determineProviderFromUrl('https://workspace.slack.com/oauth')).toBe('Slack');
    });

    it('should not be fooled by URLs containing provider names in path', () => {
      // These should return generic provider since hostname doesn't match
      expect(determineProviderFromUrl('https://evil.com/github.com/oauth')).toBe('OAuth Provider');
      expect(determineProviderFromUrl('https://malicious.site/linear.app')).toBe('OAuth Provider');
    });

    it('should handle invalid URLs gracefully', () => {
      expect(determineProviderFromUrl('not-a-url')).toBe('OAuth Provider');
      expect(determineProviderFromUrl('javascript:alert("XSS")')).toBe('OAuth Provider');
      expect(determineProviderFromUrl('')).toBe('OAuth Provider');
      expect(determineProviderFromUrl('http://')).toBe('OAuth Provider');
    });

    it('should handle custom Jira/Confluence domains', () => {
      expect(determineProviderFromUrl('https://mycompany.atlassian.net/jira')).toBe('Jira');
      expect(determineProviderFromUrl('https://jira.mycompany.com')).toBe('Jira');
      expect(determineProviderFromUrl('https://confluence.mycompany.com')).toBe('Confluence');
    });

    it('should not match partial domain names', () => {
      // Should not match "github.com" in "fakegithub.com"
      expect(determineProviderFromUrl('https://fakegithub.com/oauth')).toBe('OAuth Provider');
      expect(determineProviderFromUrl('https://notlinear.app/oauth')).toBe('OAuth Provider');
    });
  });
});