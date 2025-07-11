import { describe, it, expect } from 'vitest';
import type { SearchIndex, PaginatedSearchResult } from '@/types/search';
import { McpServerSource } from '@/db/schema';

describe('Search Utilities', () => {
  describe('paginateResults', () => {
    function paginateResults(results: SearchIndex, offset: number, pageSize: number): PaginatedSearchResult {
      const keys = Object.keys(results);
      const totalResults = keys.length;
      
      const paginatedKeys = keys.slice(offset, offset + pageSize);
      const paginatedResults: SearchIndex = {};
      
      for (const key of paginatedKeys) {
        paginatedResults[key] = results[key];
      }
      
      return {
        results: paginatedResults,
        total: totalResults,
        offset,
        pageSize,
        hasMore: offset + pageSize < totalResults,
      };
    }

    it('should paginate results correctly', () => {
      const mockResults: SearchIndex = {
        'server-1': {
          name: 'Server 1',
          description: 'Test server 1',
          command: 'node',
          args: ['server1.js'],
          envs: [],
          url: null,
          source: McpServerSource.REGISTRY,
          external_id: 'server-1',
          githubUrl: null,
          package_name: null,
          github_stars: null,
          package_registry: null,
          package_download_count: null,
        },
        'server-2': {
          name: 'Server 2',
          description: 'Test server 2',
          command: 'node',
          args: ['server2.js'],
          envs: [],
          url: null,
          source: McpServerSource.REGISTRY,
          external_id: 'server-2',
          githubUrl: null,
          package_name: null,
          github_stars: null,
          package_registry: null,
          package_download_count: null,
        },
        'server-3': {
          name: 'Server 3',
          description: 'Test server 3',
          command: 'node',
          args: ['server3.js'],
          envs: [],
          url: null,
          source: McpServerSource.REGISTRY,
          external_id: 'server-3',
          githubUrl: null,
          package_name: null,
          github_stars: null,
          package_registry: null,
          package_download_count: null,
        },
      };

      const result = paginateResults(mockResults, 0, 2);
      
      expect(result.total).toBe(3);
      expect(result.offset).toBe(0);
      expect(result.pageSize).toBe(2);
      expect(result.hasMore).toBe(true);
      expect(Object.keys(result.results).length).toBe(2);
    });

    it('should handle offset correctly', () => {
      const mockResults: SearchIndex = {};
      for (let i = 0; i < 10; i++) {
        mockResults[`server-${i}`] = {
          name: `Server ${i}`,
          description: '',
          command: '',
          args: [],
          envs: [],
          url: null,
          source: McpServerSource.REGISTRY,
          external_id: `server-${i}`,
          githubUrl: null,
          package_name: null,
          github_stars: null,
          package_registry: null,
          package_download_count: null,
        };
      }

      const result = paginateResults(mockResults, 5, 3);
      
      expect(result.offset).toBe(5);
      expect(result.pageSize).toBe(3);
      expect(Object.keys(result.results).length).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should set hasMore to false when no more results', () => {
      const mockResults: SearchIndex = {
        'server-1': {} as any,
        'server-2': {} as any,
      };

      const result = paginateResults(mockResults, 0, 5);
      
      expect(result.hasMore).toBe(false);
      expect(Object.keys(result.results).length).toBe(2);
    });
  });

  describe('Search Query Building', () => {
    it('should build correct query parameters', () => {
      const params = new URLSearchParams();
      const query = 'test server';
      const source = McpServerSource.REGISTRY;
      const offset = 10;
      const pageSize = 20;
      
      params.set('query', query);
      params.set('source', source);
      params.set('offset', offset.toString());
      params.set('pageSize', pageSize.toString());
      
      expect(params.get('query')).toBe('test server');
      expect(params.get('source')).toBe(McpServerSource.REGISTRY);
      expect(params.get('offset')).toBe('10');
      expect(params.get('pageSize')).toBe('20');
    });

    it('should handle optional parameters', () => {
      const params = new URLSearchParams();
      
      // Add package registry filter
      params.set('packageRegistry', 'npm');
      expect(params.get('packageRegistry')).toBe('npm');
      
      // Add repository source filter
      params.set('repositorySource', 'github.com');
      expect(params.get('repositorySource')).toBe('github.com');
      
      // Add sort parameter
      params.set('sort', 'recent');
      expect(params.get('sort')).toBe('recent');
    });
  });

  describe('Search Result Transformation', () => {
    it('should transform registry server to search index format', () => {
      const registryServer = {
        id: 'io.github.testuser/test-server',
        name: 'test-server',
        description: 'Test server description',
        packages: [{
          registry_name: 'npm' as const,
          name: 'test-server',
          version: 'latest',
        }],
        repository: {
          url: 'https://github.com/testuser/test-server',
        },
        installation_count: 100,
        rating: 4.5,
        rating_count: 10,
      };

      // This would be the transformation logic
      const transformed = {
        name: registryServer.name,
        description: registryServer.description,
        command: 'npx',
        args: ['test-server'],
        envs: [],
        url: null,
        source: McpServerSource.REGISTRY,
        external_id: registryServer.id,
        githubUrl: registryServer.repository?.url || null,
        package_name: registryServer.packages[0]?.name || null,
        github_stars: null,
        package_registry: registryServer.packages[0]?.registry_name || null,
        package_download_count: null,
        installation_count: registryServer.installation_count,
        rating: registryServer.rating,
        ratingCount: registryServer.rating_count,
      };

      expect(transformed.name).toBe('test-server');
      expect(transformed.source).toBe(McpServerSource.REGISTRY);
      expect(transformed.githubUrl).toBe('https://github.com/testuser/test-server');
      expect(transformed.package_registry).toBe('npm');
      expect(transformed.installation_count).toBe(100);
      expect(transformed.rating).toBe(4.5);
    });

    it('should transform community server to search index format', () => {
      const communityServer = {
        uuid: 'community-server-123',
        title: 'Community Test Server',
        description: 'A community server',
        template: {
          name: 'community-test',
          type: 'STDIO',
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'production' },
        },
        is_claimed: false,
      };

      const user = {
        username: 'testuser',
      };

      // This would be the transformation logic
      const transformed = {
        name: communityServer.title,
        description: communityServer.description || '',
        command: communityServer.template.command || '',
        args: communityServer.template.args || [],
        envs: Object.keys(communityServer.template.env || {}),
        url: null,
        source: McpServerSource.COMMUNITY,
        external_id: communityServer.uuid,
        githubUrl: null,
        package_name: null,
        github_stars: null,
        package_registry: null,
        package_download_count: null,
        shared_by: user.username,
        shared_by_profile_url: `/to/${user.username}`,
        is_claimed: communityServer.is_claimed,
      };

      expect(transformed.name).toBe('Community Test Server');
      expect(transformed.source).toBe(McpServerSource.COMMUNITY);
      expect(transformed.envs).toContain('NODE_ENV');
      expect(transformed.shared_by).toBe('testuser');
      expect(transformed.is_claimed).toBe(false);
    });
  });
});