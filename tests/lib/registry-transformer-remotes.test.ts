import { describe, it, expect } from 'vitest';
import { transformPluggedinRegistryToMcpIndex } from '@/lib/registry/registry-transformer';
import type { PluggedinRegistryServer } from '@/lib/registry/pluggedin-registry-client';

describe('Registry Transformer - Remotes Field Support', () => {
  describe('Remote-only servers (SSE/Streamable-HTTP)', () => {
    it('should handle streamable-http remote servers', () => {
      const server: PluggedinRegistryServer = {
        id: 'ai.waystation/slack',
        name: 'ai.waystation/slack',
        description: 'Send messages, access channels, and manage files in your Slack workspace.',
        remotes: [
          {
            transport_type: 'streamable-http',
            url: 'https://waystation.ai/slack/mcp',
          },
        ],
        repository: {
          url: 'https://github.com/waystation-ai/mcp',
          source: 'github',
          id: '',
        },
        version_detail: {
          version: '0.3.1',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.url).toBe('https://waystation.ai/slack/mcp');
      expect(result.command).toBeNull(); // Remote servers don't need command
      expect(result.args).toEqual([]); // Remote servers don't need args
      expect(result.source).toBe('REGISTRY');
      expect(result.external_id).toBe('ai.waystation/slack');
    });

    it('should handle SSE remote servers', () => {
      const server: PluggedinRegistryServer = {
        id: 'io.foqal/Foqal',
        name: 'io.foqal/Foqal',
        description: 'Foqal turns Slack/Teams into efficient support platforms with AI-powered ticketing.',
        remotes: [
          {
            transport_type: 'sse',
            url: 'https://support.foqal.io/api/mcp/[YOUR_GENERATED_TOKEN]',
          },
        ],
        repository: {
          url: 'https://github.com/foqal/mcp',
          source: 'github',
          id: '',
        },
        version_detail: {
          version: '2.0.1',
          release_date: '2024-01-15',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.url).toBe('https://support.foqal.io/api/mcp/[YOUR_GENERATED_TOKEN]');
      expect(result.command).toBeNull();
      expect(result.args).toEqual([]);
    });

    it('should handle servers with multiple transport options', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/multi-transport',
        name: 'test/multi-transport',
        description: 'Server with multiple transport options',
        remotes: [
          {
            transport_type: 'sse',
            url: 'https://example.com/mcp/sse',
          },
          {
            transport_type: 'streamable-http',
            url: 'https://example.com/mcp',
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      // Should prioritize streamable-http over sse
      expect(result.url).toBe('https://example.com/mcp');
      expect(result.command).toBeNull();
      expect(result.args).toEqual([]);
    });

    it('should handle remote servers with headers configuration', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/with-headers',
        name: 'test/with-headers',
        description: 'Server with custom headers',
        remotes: [
          {
            transport_type: 'streamable-http',
            url: 'https://example.com/mcp',
            headers: {
              Authorization: 'Bearer token',
              'X-Custom-Header': 'value',
            },
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.url).toBe('https://example.com/mcp');
      expect(result._rawServer).toBeDefined();
      expect(result._rawServer.remotes[0].headers).toBeDefined();
    });
  });

  describe('Package-based servers (STDIO)', () => {
    it('should handle npm package servers', () => {
      const server: PluggedinRegistryServer = {
        id: 'io.snyk/mcp',
        name: 'io.snyk/mcp',
        description: 'Snyk MCP server',
        packages: [
          {
            registry_name: 'npm',
            name: 'snyk',
            version: '1.1299.1',
          },
        ],
        version_detail: {
          version: '1.1299.1',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.command).toBe('npx');
      expect(result.args).toContain('snyk');
      expect(result.url).toBeNull(); // Package servers don't have URL
      expect(result.package_registry).toBe('npm');
    });

    it('should handle pypi package servers', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/python-server',
        name: 'test/python-server',
        description: 'Python MCP server',
        packages: [
          {
            registry_name: 'pypi',
            name: 'test-mcp-server',
            version: '1.0.0',
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.command).toBe('uvx');
      expect(result.args).toContain('test-mcp-server');
      expect(result.url).toBeNull();
      expect(result.package_registry).toBe('pypi');
    });

    it('should handle docker/oci package servers', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/docker-server',
        name: 'test/docker-server',
        description: 'Docker MCP server',
        packages: [
          {
            registry_name: 'docker',
            name: 'docker.io/test/mcp-server:latest',
            version: '1.0.0',
            package_arguments: [
              {
                type: 'positional',
                value: 'docker.io/test/mcp-server:latest',
              },
            ],
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.command).toBe('docker');
      expect(result.args).toContain('run');
      expect(result.args).toContain('docker.io/test/mcp-server:latest');
      expect(result.url).toBeNull();
      expect(result.package_registry).toBe('docker');
    });
  });

  describe('Hybrid servers (both packages and remotes)', () => {
    it('should prioritize remotes over packages', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/hybrid',
        name: 'test/hybrid',
        description: 'Server with both deployment options',
        packages: [
          {
            registry_name: 'npm',
            name: 'test-package',
            version: '1.0.0',
          },
        ],
        remotes: [
          {
            transport_type: 'streamable-http',
            url: 'https://example.com/mcp',
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      // Should prioritize remote configuration
      expect(result.url).toBe('https://example.com/mcp');
      expect(result.command).toBeNull();
      expect(result.args).toEqual([]);

      // But should still preserve package info in raw data
      expect(result._rawServer.packages).toBeDefined();
      expect(result._rawServer.packages[0].name).toBe('test-package');
    });

    it('should handle hybrid server with environment variables', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/hybrid-with-env',
        name: 'test/hybrid-with-env',
        description: 'Hybrid server with env vars',
        packages: [
          {
            registry_name: 'npm',
            name: 'test-package',
            version: '1.0.0',
            environment_variables: [
              {
                name: 'API_KEY',
                description: 'API key for authentication',
              },
            ],
          },
        ],
        remotes: [
          {
            transport_type: 'sse',
            url: 'https://example.com/mcp',
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.url).toBe('https://example.com/mcp');
      expect(result.envs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'API_KEY' }),
        ])
      );
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle server with no packages and no remotes', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/empty',
        name: 'test/empty',
        description: 'Server with no deployment options',
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.command).toBe(''); // No command available
      expect(result.args).toEqual([]);
      expect(result.url).toBeNull();
    });

    it('should handle empty remotes array', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/empty-remotes',
        name: 'test/empty-remotes',
        description: 'Server with empty remotes',
        remotes: [],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.url).toBeNull();
      expect(result.command).toBe('');
    });

    it('should handle malformed remote URLs', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/malformed-url',
        name: 'test/malformed-url',
        description: 'Server with malformed URL',
        remotes: [
          {
            transport_type: 'sse',
            url: '', // Empty URL
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      // Should handle gracefully - empty URL becomes null
      expect(result.url).toBeNull();
    });

    it('should preserve all server metadata', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/full-metadata',
        name: 'test/full-metadata',
        description: 'Server with full metadata',
        remotes: [
          {
            transport_type: 'streamable-http',
            url: 'https://example.com/mcp',
          },
        ],
        repository: {
          url: 'https://github.com/test/repo',
          source: 'github',
          id: 'test-repo',
        },
        version_detail: {
          version: '2.5.1',
          release_date: '2024-01-20',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.githubUrl).toBe('https://github.com/test/repo');
      expect(result.updated_at).toBe('2024-01-20');
      expect(result.qualifiedName).toBe('test/full-metadata');
    });
  });

  describe('Transport type inference', () => {
    it('should infer correct transport for streamable-http', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/http',
        name: 'test/http',
        description: 'HTTP transport',
        remotes: [
          {
            transport_type: 'streamable-http',
            url: 'https://example.com/mcp',
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      // Should be recognized as remote with URL
      expect(result.url).toBeTruthy();
      expect(result.command).toBeNull();
    });

    it('should infer correct transport for sse', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/sse',
        name: 'test/sse',
        description: 'SSE transport',
        remotes: [
          {
            transport_type: 'sse',
            url: 'https://example.com/sse',
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.url).toBe('https://example.com/sse');
      expect(result.command).toBeNull();
    });

    it('should infer STDIO for npm packages', () => {
      const server: PluggedinRegistryServer = {
        id: 'test/npm',
        name: 'test/npm',
        description: 'NPM package',
        packages: [
          {
            registry_name: 'npm',
            name: 'test-package',
            version: '1.0.0',
          },
        ],
        version_detail: {
          version: '1.0.0',
          release_date: '2024-01-01',
          is_latest: true,
        },
      };

      const result = transformPluggedinRegistryToMcpIndex(server);

      expect(result.url).toBeNull();
      expect(result.command).toBeTruthy();
      expect(result.package_registry).toBe('npm');
    });
  });
});
