import { beforeEach, describe, expect, it, vi } from 'vitest';

import { 
  createMcpServer, 
  updateMcpServer, 
  deleteMcpServer,
  getMcpServers 
} from '@/app/actions/mcp-servers';
import { db } from '@/db';
import { McpServerStatus, McpServerType } from '@/db/schema';
import { createMockMcpServer, createMockProfile, createMockAuthResult } from '../utils/mocks';

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
  });

  describe('createMcpServer', () => {
    it('should successfully create a new MCP server', async () => {
      const serverData = {
        name: 'Test MCP Server',
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
      expect(result.server).toEqual(newServer);
      expect(mockedDb.insert).toHaveBeenCalled();
      expect(mockedDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          name: serverData.name,
          type: serverData.type,
          command: serverData.command,
        })
      );
    });

    it('should fail with invalid server type', async () => {
      const serverData = {
        name: 'Test MCP Server',
        type: 'INVALID_TYPE' as any,
        command: 'node',
      };

      const result = await createMcpServer(serverData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid server type');
    });

    it('should fail with missing required fields', async () => {
      const serverData = {
        // Missing name and command
        type: McpServerType.STDIO,
      } as any;

      const result = await createMcpServer(serverData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should handle database errors during creation', async () => {
      const serverData = {
        name: 'Test MCP Server',
        type: McpServerType.STDIO,
        command: 'node',
      };

      mockedDb.returning.mockRejectedValueOnce(new Error('Database constraint violation'));

      const result = await createMcpServer(serverData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database constraint violation');
    });
  });

  describe('updateMcpServer', () => {
    it('should successfully update an existing MCP server', async () => {
      const serverUuid = 'test-server-uuid';
      const updateData = {
        name: 'Updated Server Name',
        description: 'Updated description',
        status: McpServerStatus.INACTIVE,
      };

      const existingServer = createMockMcpServer({ uuid: serverUuid });
      const updatedServer = { ...existingServer, ...updateData };

      // Mock server exists check
      mockedDb.returning.mockResolvedValueOnce([existingServer]);
      // Mock update operation
      mockedDb.returning.mockResolvedValueOnce([updatedServer]);

      const result = await updateMcpServer(serverUuid, updateData);

      expect(result.success).toBe(true);
      expect(result.server).toEqual(updatedServer);
      expect(mockedDb.update).toHaveBeenCalled();
      expect(mockedDb.set).toHaveBeenCalledWith(
        expect.objectContaining(updateData)
      );
    });

    it('should fail if server does not exist', async () => {
      const serverUuid = 'nonexistent-server-uuid';
      const updateData = { name: 'Updated Name' };

      // Mock server not found
      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await updateMcpServer(serverUuid, updateData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Server not found');
    });

    it('should fail if user does not own the server', async () => {
      const serverUuid = 'test-server-uuid';
      const updateData = { name: 'Updated Name' };

      const serverFromDifferentProfile = createMockMcpServer({
        uuid: serverUuid,
        profile_uuid: 'different-profile-uuid',
      });

      // Mock server exists but belongs to different profile
      mockedDb.returning.mockResolvedValueOnce([serverFromDifferentProfile]);

      const result = await updateMcpServer(serverUuid, updateData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not authorized');
    });
  });

  describe('deleteMcpServer', () => {
    it('should successfully delete an MCP server', async () => {
      const serverUuid = 'test-server-uuid';
      const existingServer = createMockMcpServer({ uuid: serverUuid });

      // Mock server exists check
      mockedDb.returning.mockResolvedValueOnce([existingServer]);
      // Mock delete operation
      mockedDb.returning.mockResolvedValueOnce([existingServer]);

      const result = await deleteMcpServer(serverUuid);

      expect(result.success).toBe(true);
      expect(mockedDb.delete).toHaveBeenCalled();
    });

    it('should fail if server does not exist', async () => {
      const serverUuid = 'nonexistent-server-uuid';

      // Mock server not found
      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await deleteMcpServer(serverUuid);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Server not found');
    });

    it('should handle database errors during deletion', async () => {
      const serverUuid = 'test-server-uuid';
      const existingServer = createMockMcpServer({ uuid: serverUuid });

      // Mock server exists
      mockedDb.returning.mockResolvedValueOnce([existingServer]);
      // Mock delete error
      mockedDb.returning.mockRejectedValueOnce(new Error('Foreign key constraint'));

      const result = await deleteMcpServer(serverUuid);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Foreign key constraint');
    });
  });

  describe('getMcpServers', () => {
    it('should return all servers for active profile', async () => {
      const servers = [
        createMockMcpServer({ name: 'Server 1', status: McpServerStatus.ACTIVE }),
        createMockMcpServer({ name: 'Server 2', status: McpServerStatus.INACTIVE }),
      ];

      mockedDb.returning.mockResolvedValueOnce(servers);

      const result = await getMcpServers();

      expect(result.success).toBe(true);
      expect(result.servers).toEqual(servers);
      expect(result.servers).toHaveLength(2);
    });

    it('should filter servers by status', async () => {
      const activeServers = [
        createMockMcpServer({ name: 'Active Server', status: McpServerStatus.ACTIVE }),
      ];

      mockedDb.returning.mockResolvedValueOnce(activeServers);

      const result = await getMcpServers({ status: McpServerStatus.ACTIVE });

      expect(result.success).toBe(true);
      expect(result.servers).toEqual(activeServers);
      expect(mockedDb.where).toHaveBeenCalledWith(
        expect.objectContaining({
          // Should include status filter
        })
      );
    });

    it('should handle database errors during fetch', async () => {
      mockedDb.returning.mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await getMcpServers();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should return empty array when no servers exist', async () => {
      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await getMcpServers();

      expect(result.success).toBe(true);
      expect(result.servers).toEqual([]);
      expect(result.servers).toHaveLength(0);
    });
  });
});