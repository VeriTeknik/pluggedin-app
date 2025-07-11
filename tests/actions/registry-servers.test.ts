import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyGitHubOwnership } from '@/app/actions/registry-servers';
import { createMockFetchResponse, mockGitHubResponses } from '../utils/mocks';

describe('Registry Server Actions - Simple Tests', () => {
  describe('verifyGitHubOwnership', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should verify ownership for valid repository', async () => {
      // First mock the user API call
      global.fetch = vi.fn()
        .mockResolvedValueOnce(createMockFetchResponse({ login: 'testuser' })) // user API
        .mockResolvedValueOnce(createMockFetchResponse([])); // orgs API

      const result = await verifyGitHubOwnership('ghp_testtoken', 'https://github.com/testuser/test-mcp-server');
      
      expect(result.isOwner).toBe(true);
      expect(result.githubUsername).toBe('testuser');
    });

    it('should reject invalid GitHub URL format', async () => {
      // The actual implementation catches the error and returns a failure response
      const result = await verifyGitHubOwnership('ghp_testtoken', 'https://not-github.com/user/repo');
      
      expect(result.isOwner).toBe(false);
      expect(result.reason).toContain('Failed to verify ownership');
    });

    it('should handle authentication failure', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockFetchResponse({ message: 'Bad credentials' }, 401)
      );

      const result = await verifyGitHubOwnership('ghp_testtoken', 'https://github.com/testuser/non-existent');
      
      expect(result.isOwner).toBe(false);
      expect(result.reason).toContain('Failed to fetch GitHub user info');
      expect(result.needsAuth).toBe(true);
    });

    it('should reject if user does not own the repository', async () => {
      // Mock user as 'testuser' trying to claim 'otheruser' repo
      global.fetch = vi.fn()
        .mockResolvedValueOnce(createMockFetchResponse({ login: 'testuser' })) // user API
        .mockResolvedValueOnce(createMockFetchResponse([])); // orgs API (empty)

      const result = await verifyGitHubOwnership('ghp_testtoken', 'https://github.com/otheruser/other-mcp-server');
      
      expect(result.isOwner).toBe(false);
      expect(result.reason).toContain('Repository owner');
    });

    it('should verify ownership for organization repository', async () => {
      // Mock user as member of an organization
      global.fetch = vi.fn()
        .mockResolvedValueOnce(createMockFetchResponse({ login: 'testuser' })) // user API
        .mockResolvedValueOnce(createMockFetchResponse([{ login: 'testorg' }])); // orgs API

      const result = await verifyGitHubOwnership('ghp_testtoken', 'https://github.com/testorg/test-mcp-server');
      
      expect(result.isOwner).toBe(true);
      expect(result.githubUsername).toBe('testuser');
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await verifyGitHubOwnership('ghp_testtoken', 'https://github.com/testuser/test-mcp-server');
      
      expect(result.isOwner).toBe(false);
      expect(result.reason).toContain('Failed to verify ownership');
    });
  });
});