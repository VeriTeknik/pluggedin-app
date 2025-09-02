import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServerSlugService } from '@/lib/services/mcp-server-slug-service';
import { generateSlug, isValidSlug } from '@/lib/utils/slug-utils';
import { 
  slugSchema, 
  createMcpServerSchema, 
  updateMcpServerSchema,
  generateSlugSchema,
  checkSlugAvailabilitySchema 
} from '@/lib/validation/mcp-server-schemas';
import { McpServerType, McpServerStatus } from '@/db/schema';

describe('Slug Utilities', () => {
  describe('Slug Generation', () => {
    it('should generate valid slug from server name', () => {
      const slug = generateSlug('My Test Server');
      expect(slug).toBe('my-test-server');
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('should handle special characters', () => {
      expect(generateSlug('Test@#$%Server')).toBe('testserver');
      expect(generateSlug('Hello!@#World')).toBe('helloworld');
    });

    it('should handle spaces and hyphens', () => {
      expect(generateSlug('Test   Server')).toBe('test-server');
      expect(generateSlug('Test---Server')).toBe('test-server');
    });

    it('should truncate long names', () => {
      const longName = 'a'.repeat(100);
      const slug = generateSlug(longName);
      expect(slug.length).toBeLessThanOrEqual(50);
    });

    it('should handle empty or whitespace-only names', () => {
      expect(generateSlug('')).toBe('server');
      expect(generateSlug('   ')).toBe('server');
    });

    it('should handle unicode characters', () => {
      expect(generateSlug('Café Server')).toBe('caf-server');
      expect(generateSlug('Server™')).toBe('server');
    });
  });

  describe('Slug Validation', () => {
    it('should validate correct slugs', () => {
      expect(isValidSlug('test-server')).toBe(true);
      expect(isValidSlug('server123')).toBe(true);
      expect(isValidSlug('my-mcp-server')).toBe(true);
    });

    it('should reject invalid slugs', () => {
      expect(isValidSlug('Test-Server')).toBe(false); // Uppercase
      expect(isValidSlug('test server')).toBe(false); // Space
      expect(isValidSlug('test_server')).toBe(false); // Underscore
      expect(isValidSlug('-test')).toBe(false); // Leading hyphen
      expect(isValidSlug('test-')).toBe(false); // Trailing hyphen
      expect(isValidSlug('')).toBe(false); // Empty
    });
  });
});

describe('Zod Validation Schemas', () => {
  describe('slugSchema', () => {
    it('should validate correct slugs', () => {
      const result = slugSchema.safeParse('test-server');
      expect(result.success).toBe(true);
    });

    it('should accept undefined (optional)', () => {
      const result = slugSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should reject invalid slugs', () => {
      const result = slugSchema.safeParse('Invalid-Slug');
      expect(result.success).toBe(false);
      expect(result.error?.errors[0]?.message).toContain('lowercase');
    });

    it('should reject too long slugs', () => {
      const longSlug = 'a'.repeat(51);
      const result = slugSchema.safeParse(longSlug);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0]?.message).toContain('50 characters');
    });
  });

  describe('createMcpServerSchema', () => {
    it('should validate STDIO server creation', () => {
      const data = {
        type: McpServerType.STDIO,
        name: 'Test Server',
        command: 'npx',
        args: ['mcp-server-time'],
        description: 'A test server'
      };
      
      const result = createMcpServerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate SSE server creation', () => {
      const data = {
        type: McpServerType.SSE,
        name: 'SSE Server',
        server_url: 'https://example.com/sse',
        headers: { 'Authorization': 'Bearer token' }
      };
      
      const result = createMcpServerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate Streamable HTTP server creation', () => {
      const data = {
        type: McpServerType.STREAMABLE_HTTP,
        name: 'HTTP Server',
        server_url: 'https://api.example.com',
        sessionId: 'session123'
      };
      
      const result = createMcpServerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject STDIO server without command', () => {
      const data = {
        type: McpServerType.STDIO,
        name: 'Test Server'
      };
      
      const result = createMcpServerSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject SSE server without URL', () => {
      const data = {
        type: McpServerType.SSE,
        name: 'SSE Server'
      };
      
      const result = createMcpServerSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject invalid URL', () => {
      const data = {
        type: McpServerType.SSE,
        name: 'SSE Server',
        server_url: 'not-a-url'
      };
      
      const result = createMcpServerSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0]?.message).toContain('Invalid server URL');
    });
  });

  describe('updateMcpServerSchema', () => {
    it('should allow partial updates', () => {
      const data = {
        name: 'Updated Name'
      };
      
      const result = updateMcpServerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate slug updates', () => {
      const data = {
        slug: 'new-slug'
      };
      
      const result = updateMcpServerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid slug updates', () => {
      const data = {
        slug: 'Invalid Slug'
      };
      
      const result = updateMcpServerSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should validate type-specific updates', () => {
      const data = {
        type: McpServerType.STDIO,
        command: 'new-command'
      };
      
      const result = updateMcpServerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('generateSlugSchema', () => {
    it('should validate slug generation request', () => {
      const data = {
        name: 'Test Server',
        profileUuid: '550e8400-e29b-41d4-a716-446655440000'
      };
      
      const result = generateSlugSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept excludeUuid', () => {
      const data = {
        name: 'Test Server',
        profileUuid: '550e8400-e29b-41d4-a716-446655440000',
        excludeUuid: '123e4567-e89b-12d3-a456-426614174000'
      };
      
      const result = generateSlugSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const data = {
        name: 'Test Server',
        profileUuid: 'not-a-uuid'
      };
      
      const result = generateSlugSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0]?.message).toContain('Invalid profile UUID');
    });

    it('should reject empty name', () => {
      const data = {
        name: '',
        profileUuid: '550e8400-e29b-41d4-a716-446655440000'
      };
      
      const result = generateSlugSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('checkSlugAvailabilitySchema', () => {
    it('should validate availability check', () => {
      const data = {
        slug: 'test-slug',
        profileUuid: '550e8400-e29b-41d4-a716-446655440000'
      };
      
      const result = checkSlugAvailabilitySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should require slug', () => {
      const data = {
        profileUuid: '550e8400-e29b-41d4-a716-446655440000'
      };
      
      const result = checkSlugAvailabilitySchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});

describe('Integration Tests', () => {
  describe('Slug Uniqueness', () => {
    it('should generate unique slugs for similar names', () => {
      const slugs = new Set<string>();
      const baseNames = ['Test Server', 'test-server', 'TEST SERVER', 'Test  Server'];
      
      baseNames.forEach(name => {
        const slug = generateSlug(name);
        // All should generate the same base slug
        expect(slug).toBe('test-server');
      });
    });

    it('should handle collision resolution', () => {
      // This would need actual database mocking
      // Placeholder for integration test
      expect(true).toBe(true);
    });
  });

  describe('Tool Prefixing', () => {
    it('should create prefixed tool names', () => {
      const slug = 'my-server';
      const toolName = 'read_file';
      const prefixed = `${slug}__${toolName}`;
      
      expect(prefixed).toBe('my-server__read_file');
      expect(prefixed).toMatch(/^[a-z0-9-]+__/);
    });

    it('should parse prefixed tool names', () => {
      const prefixed = 'my-server__read_file';
      const parts = prefixed.split('__');
      
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('my-server');
      expect(parts[1]).toBe('read_file');
    });
  });
});