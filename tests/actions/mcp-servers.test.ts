import { beforeEach, describe, expect, it, vi } from 'vitest';

import { 
  createMcpServer, 
  updateMcpServer, 
  deleteMcpServerByUuid,
  getMcpServers 
} from '@/app/actions/mcp-servers';
import { db } from '@/db';
import { McpServerStatus, McpServerType } from '@/db/schema';
import { createMockMcpServer, createMockProfile } from '../utils/mocks';

// Mock dependencies
vi.mock('@/db');
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(() => Promise.resolve({
    user: { id: 'test-user-id' }
  })),
}));
vi.mock('@/app/actions/profiles', () => ({
  getActiveProfile: vi.fn(() => Promise.resolve(createMockProfile())),
}));
vi.mock('@/lib/encryption', () => ({
  encryptServerData: vi.fn((data) => JSON.stringify(data)),
  decryptServerData: vi.fn((data) => data),
}));

const mockedDb = vi.mocked(db);

describe('MCP Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockedDb.select = vi.fn().mockReturnThis();
    mockedDb.insert = vi.fn().mockReturnThis();
    mockedDb.update = vi.fn().mockReturnThis();
    mockedDb.delete = vi.fn().mockReturnThis();
    mockedDb.from = vi.fn().mockReturnThis();
    mockedDb.where = vi.fn().mockReturnThis();
    mockedDb.values = vi.fn().mockReturnThis();
    mockedDb.set = vi.fn().mockReturnThis();
    mockedDb.returning = vi.fn();
    mockedDb.leftJoin = vi.fn().mockReturnThis();
    mockedDb.orderBy = vi.fn().mockReturnThis();
  });

  describe('createMcpServer', () => {
    it('should successfully create a new MCP server', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverData = {
        name: 'Test MCP Server',
        profileUuid,
        description: 'Test server description',
        type: McpServerType.STDIO,
        command: 'node',
        args: ['test-server.js'],
        env: { NODE_ENV: 'production' },
      };

      const newServer = createMockMcpServer({
        ...serverData,
        uuid: 'new-server-uuid',
        status: McpServerStatus.ACTIVE,
      });

      mockedDb.returning.mockResolvedValueOnce([newServer]);

      const result = await createMcpServer(serverData);

      expect(result.success).toBe(true);
      expect(mockedDb.insert).toHaveBeenCalled();
    });

    it('should fail with missing command for STDIO type', async () => {
      const serverData = {
        name: 'Test MCP Server',
        profileUuid: 'test-profile-uuid',
        type: McpServerType.STDIO,
        // Missing command
      };

      const result = await createMcpServer(serverData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command is required');
    });

    it('should fail with missing URL for SSE type', async () => {
      const serverData = {
        name: 'Test MCP Server',
        profileUuid: 'test-profile-uuid',
        type: McpServerType.SSE,
        // Missing URL
      };

      const result = await createMcpServer(serverData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('URL is required');
    });

    it('should handle database errors during creation', async () => {
      const serverData = {
        name: 'Test MCP Server',
        profileUuid: 'test-profile-uuid',
        type: McpServerType.STDIO,
        command: 'node',
      };

      mockedDb.returning.mockRejectedValueOnce(new Error('Database error'));

      const result = await createMcpServer(serverData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create');
    });
  });

  describe('updateMcpServer', () => {
    it('should successfully update an existing MCP server', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverUuid = 'test-server-uuid';
      const updateData = {
        name: 'Updated Server Name',
        description: 'Updated description',
      };

      const existingServer = createMockMcpServer({ 
        uuid: serverUuid,
        profile_uuid: profileUuid 
      });
      const updatedServer = { ...existingServer, ...updateData };

      // Mock successful update
      mockedDb.returning.mockResolvedValueOnce([updatedServer]);

      const result = await updateMcpServer(profileUuid, serverUuid, updateData);

      expect(result).toBeDefined();
      expect(mockedDb.update).toHaveBeenCalled();
    });

    it('should fail if server does not exist', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverUuid = 'nonexistent-server-uuid';
      const updateData = { name: 'Updated Name' };

      // Mock no server found
      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await updateMcpServer(profileUuid, serverUuid, updateData);

      expect(result).toBeUndefined();
    });

    it('should fail if user does not own the server', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverUuid = 'test-server-uuid';
      const updateData = { name: 'Updated Name' };

      // Mock no matching server for this profile
      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await updateMcpServer(profileUuid, serverUuid, updateData);

      expect(result).toBeUndefined();
    });
  });

  describe('deleteMcpServerByUuid', () => {
    it('should successfully delete an MCP server', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverUuid = 'test-server-uuid';

      await deleteMcpServerByUuid(profileUuid, serverUuid);

      expect(mockedDb.delete).toHaveBeenCalled();
      expect(mockedDb.where).toHaveBeenCalled();
    });

    it('should not throw if server does not exist', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverUuid = 'nonexistent-server-uuid';

      // Should not throw even if nothing is deleted
      await expect(deleteMcpServerByUuid(profileUuid, serverUuid)).resolves.not.toThrow();
    });

    it('should handle database errors during deletion', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverUuid = 'test-server-uuid';

      mockedDb.delete.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(deleteMcpServerByUuid(profileUuid, serverUuid)).rejects.toThrow('Database error');
    });
  });

  describe('getMcpServers', () => {
    it('should return all servers for active profile', async () => {
      const profileUuid = 'test-profile-uuid';
      const mockServers = [
        { 
          server: createMockMcpServer({ profile_uuid: profileUuid }),
          username: 'testuser'
        },
        { 
          server: createMockMcpServer({ profile_uuid: profileUuid }),
          username: 'testuser'
        },
      ];

      mockedDb.orderBy.mockResolvedValueOnce(mockServers);

      const result = await getMcpServers(profileUuid);

      expect(result).toHaveLength(2);
      expect(mockedDb.select).toHaveBeenCalled();
      expect(mockedDb.from).toHaveBeenCalled();
    });

    it('should filter servers by status', async () => {
      const profileUuid = 'test-profile-uuid';
      const mockServers = [
        { 
          server: createMockMcpServer({ 
            profile_uuid: profileUuid,
            status: McpServerStatus.ACTIVE 
          }),
          username: 'testuser'
        },
      ];

      mockedDb.orderBy.mockResolvedValueOnce(mockServers);

      const result = await getMcpServers(profileUuid);

      expect(result).toHaveLength(1);
      expect(mockedDb.where).toHaveBeenCalled();
    });

    it('should handle database errors during fetch', async () => {
      const profileUuid = 'test-profile-uuid';

      mockedDb.select.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(getMcpServers(profileUuid)).rejects.toThrow('Database error');
    });

    it('should return empty array when no servers exist', async () => {
      const profileUuid = 'test-profile-uuid';

      mockedDb.orderBy.mockResolvedValueOnce([]);

      const result = await getMcpServers(profileUuid);

      expect(result).toEqual([]);
    });
  });
});