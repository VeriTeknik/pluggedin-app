import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Extract validation logic from community-servers.ts
const createCommunityServerSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  template: z.object({
    name: z.string(),
    type: z.enum(['STDIO', 'SSE', 'STREAMABLE_HTTP']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    url: z.string().url().optional(),
    transport: z.string().optional(),
    streamableHTTPOptions: z.any().optional(),
  }),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  profileUuid: z.string().uuid(),
});

const claimCommunityServerSchema = z.object({
  communityServerUuid: z.string().uuid(),
  repositoryUrl: z.string().url().refine(
    (url) => {
      const regex = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)$/;
      return regex.test(url);
    },
    {
      message: 'Invalid GitHub repository URL format. Expected: https://github.com/owner/repo',
    }
  ),
  registryToken: z.string().min(1).optional(),
});

describe('Community Server Validation', () => {
  describe('createCommunityServerSchema', () => {
    it('should validate valid community server data', () => {
      const validData = {
        title: 'Test Community Server',
        description: 'A test server for the community',
        template: {
          name: 'test-server',
          type: 'STDIO',
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'production' },
        },
        tags: ['test', 'example'],
        category: 'utilities',
        profileUuid: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createCommunityServerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require title', () => {
      const invalidData = {
        template: {
          name: 'test-server',
          type: 'STDIO',
        },
        profileUuid: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createCommunityServerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate server type enum', () => {
      const invalidData = {
        title: 'Test Server',
        template: {
          name: 'test-server',
          type: 'INVALID_TYPE',
        },
        profileUuid: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createCommunityServerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate URL for streamable servers', () => {
      const validData = {
        title: 'Test Streamable Server',
        template: {
          name: 'test-streamable',
          type: 'STREAMABLE_HTTP',
          url: 'https://api.example.com/mcp',
        },
        profileUuid: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createCommunityServerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate profile UUID format', () => {
      const invalidData = {
        title: 'Test Server',
        template: {
          name: 'test-server',
          type: 'STDIO',
        },
        profileUuid: 'not-a-uuid',
      };

      const result = createCommunityServerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('claimCommunityServerSchema', () => {
    it('should validate valid claim data', () => {
      const validData = {
        communityServerUuid: '123e4567-e89b-12d3-a456-426614174000',
        repositoryUrl: 'https://github.com/testuser/test-repo',
        registryToken: 'ghp_testtoken123',
      };

      const result = claimCommunityServerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate GitHub URL format', () => {
      const invalidData = {
        communityServerUuid: '123e4567-e89b-12d3-a456-426614174000',
        repositoryUrl: 'https://gitlab.com/user/repo',
      };

      const result = claimCommunityServerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toContain('Invalid GitHub repository URL');
    });

    it('should allow missing registry token', () => {
      const validData = {
        communityServerUuid: '123e4567-e89b-12d3-a456-426614174000',
        repositoryUrl: 'https://github.com/testuser/test-repo',
      };

      const result = claimCommunityServerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate UUID format', () => {
      const invalidData = {
        communityServerUuid: 'not-a-uuid',
        repositoryUrl: 'https://github.com/testuser/test-repo',
      };

      const result = claimCommunityServerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid URLs', () => {
      const invalidData = {
        communityServerUuid: '123e4567-e89b-12d3-a456-426614174000',
        repositoryUrl: 'not-a-url',
      };

      const result = claimCommunityServerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('Package Info Extraction', () => {
    // Helper function to extract package info from template
    function extractPackageInfo(template: any) {
      const packageInfo = {
        registry: 'npm' as 'npm' | 'docker' | 'pypi',
        name: '',
        version: 'latest',
      };

      // Determine package type and name from command
      if (template.command === 'npx' && template.args?.[0]) {
        packageInfo.registry = 'npm';
        packageInfo.name = template.args[0].replace('@latest', '').replace(/-y$/, '').trim();
      } else if (template.command === 'node' && template.args?.[0]) {
        packageInfo.registry = 'npm';
        packageInfo.name = template.args[0];
      } else if (template.command === 'python' && template.args?.[0] === '-m' && template.args?.[1]) {
        packageInfo.registry = 'pypi';
        packageInfo.name = template.args[1];
      } else if (template.command === 'docker' && template.args?.[0] === 'run') {
        packageInfo.registry = 'docker';
        // Extract image name from docker run command
        const imageArg = template.args.find((arg: string, i: number) => 
          i > 0 && !arg.startsWith('-') && template.args[i-1] !== '--name'
        );
        if (imageArg) {
          packageInfo.name = imageArg.split(':')[0];
        }
      }

      // Default to repository name if can't determine
      if (!packageInfo.name) {
        packageInfo.name = template.name || 'unknown';
      }

      return packageInfo;
    }

    it('should extract npm package info from npx command', () => {
      const template = {
        command: 'npx',
        args: ['test-mcp-server@latest'],
      };

      const info = extractPackageInfo(template);
      expect(info.registry).toBe('npm');
      expect(info.name).toBe('test-mcp-server');
    });

    it('should extract pypi package info', () => {
      const template = {
        command: 'python',
        args: ['-m', 'test_mcp_server'],
      };

      const info = extractPackageInfo(template);
      expect(info.registry).toBe('pypi');
      expect(info.name).toBe('test_mcp_server');
    });

    it('should extract docker image info', () => {
      const template = {
        command: 'docker',
        args: ['run', '-it', 'testuser/test-mcp-server:latest'],
      };

      const info = extractPackageInfo(template);
      expect(info.registry).toBe('docker');
      expect(info.name).toBe('testuser/test-mcp-server');
    });

    it('should handle node command', () => {
      const template = {
        command: 'node',
        args: ['server.js'],
      };

      const info = extractPackageInfo(template);
      expect(info.registry).toBe('npm');
      expect(info.name).toBe('server.js');
    });

    it('should use template name as fallback', () => {
      const template = {
        name: 'custom-server',
        command: 'custom',
        args: [],
      };

      const info = extractPackageInfo(template);
      expect(info.name).toBe('custom-server');
    });
  });
});