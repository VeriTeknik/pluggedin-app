import { and,eq } from 'drizzle-orm';
import { beforeEach,describe, expect, it, vi } from 'vitest';

import { authenticateApiKey } from '@/app/api/auth';
import { GET as toolsGetHandler,POST as toolsPostHandler } from '@/app/api/tools/route';
import { db } from '@/db';
import { mcpServersTable, McpServerStatus,ToggleStatus, toolsTable } from '@/db/schema';

// --- Mocking Setup ---

// Mock dependencies
vi.mock('@/app/api/auth');
vi.mock('@/db'); // Mock the entire db module

// Get typed mocks
const mockedAuthenticateApiKey = vi.mocked(authenticateApiKey);
const mockedDb = vi.mocked(db); // Mock the db export directly

// Define reusable mock objects for the final steps of the query chains
const mockWhere = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn(); // Mock for the values method

beforeEach(() => {
  vi.clearAllMocks();
  // Default successful authentication
  mockedAuthenticateApiKey.mockResolvedValue({ activeProfile: { uuid: 'profile-uuid-123' } } as any);

  // Reset and configure mocks for db methods before each test
  // Mock db.select chain
  mockedDb.select.mockReturnValue({
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: mockWhere,
  } as any);

  // Mock db.insert chain
  mockedDb.insert.mockReturnValue({
    values: mockValues.mockReturnThis(), // Use the mockValues function here
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: mockReturning,
  } as any);

  // Default resolved values for the final steps
  mockWhere.mockResolvedValue([]); // Default empty for GET/server check
  mockReturning.mockResolvedValue([]); // Default empty for POST
});


// Helper to create mock NextRequest
function createMockRequest(method: string, body?: any, searchParams?: URLSearchParams): Request {
  const url = `http://localhost/api/tools${searchParams ? '?' + searchParams.toString() : ''}`;
  const requestOptions: RequestInit = { method };
  if (body) {
    requestOptions.body = JSON.stringify(body);
    requestOptions.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, requestOptions);
}

// --- Tests ---

describe('Tools API (/api/tools)', () => {

  const mockProfile = { uuid: 'profile-uuid-123' };
  const mockValidServerUuid = 'server-uuid-abc';


  describe('POST /api/tools', () => {
    it('should return 401 if authentication fails', async () => {
      mockedAuthenticateApiKey.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) } as any);
      const mockReq = createMockRequest('POST', { tools: [] });
      const response = await toolsPostHandler(mockReq);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('should return 400 if tools array is missing or empty', async () => {
      let mockReq = createMockRequest('POST', {}); // Missing tools
      let response = await toolsPostHandler(mockReq);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Request must include a non-empty array of tools' });

      mockReq = createMockRequest('POST', { tools: [] }); // Empty tools
      response = await toolsPostHandler(mockReq);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Request must include a non-empty array of tools' });
    });

     it('should filter out tools with invalid server UUIDs', async () => {
       const toolsPayload = {
         tools: [
           { name: 'tool1', toolSchema: {}, mcp_server_uuid: mockValidServerUuid },
           { name: 'tool2', toolSchema: {}, mcp_server_uuid: 'invalid-server-uuid' },
         ]
       };
       const mockReq = createMockRequest('POST', toolsPayload);
       // Mock server check to return only the valid UUID
       mockWhere.mockResolvedValueOnce([{ uuid: mockValidServerUuid }]);
       // Mock insert returning only the valid tool
       mockReturning.mockResolvedValue([toolsPayload.tools[0]]);

       const response = await toolsPostHandler(mockReq);
       const data = await response.json();

       expect(response.status).toBe(200);
       expect(data.success).toBe(false);
       expect(data.successCount).toBe(1);
       expect(data.failureCount).toBe(1);
       expect(data.errors).toHaveLength(1);
       expect(data.errors[0].error).toContain('Invalid mcp_server_uuid');
       expect(data.results).toHaveLength(1);
       expect(data.results[0].name).toBe('tool1');
       // Verify insert was called only with valid tool data
       expect(mockValues).toHaveBeenCalledWith( // Check argument passed to mockValues
         expect.arrayContaining([
           expect.objectContaining({ name: 'tool1', mcp_server_uuid: mockValidServerUuid })
         ])
       );
        expect(mockValues).toHaveBeenCalledWith( // Check argument passed to mockValues
         expect.not.arrayContaining([
           expect.objectContaining({ name: 'tool2' })
         ])
       );
     });

    it('should successfully insert/update valid tools', async () => {
      const toolsPayload = {
        tools: [
          { name: 'tool1', description: 'Desc 1', toolSchema: { type: 'object' }, mcp_server_uuid: mockValidServerUuid, status: 'ACTIVE' },
          { name: 'tool2', toolSchema: { type: 'string' }, mcp_server_uuid: mockValidServerUuid, status: 'INACTIVE' },
        ]
      };
      const mockReq = createMockRequest('POST', toolsPayload);
      // Mock server check
      mockWhere.mockResolvedValueOnce([{ uuid: mockValidServerUuid }]);
      // Mock DB returning the processed tools
      mockReturning.mockResolvedValue(toolsPayload.tools);

      const response = await toolsPostHandler(mockReq);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.successCount).toBe(2);
      expect(data.failureCount).toBe(0);
      expect(data.errors).toHaveLength(0);
      expect(data.results).toHaveLength(2);
      // Check the data passed to the 'values' method
      expect(mockValues).toHaveBeenCalledWith( // Check argument passed to mockValues
         expect.arrayContaining([
           expect.objectContaining({ name: 'tool1', status: ToggleStatus.ACTIVE }),
           expect.objectContaining({ name: 'tool2', status: ToggleStatus.INACTIVE })
         ])
      );
    });

     it('should handle database errors during upsert', async () => {
       const toolsPayload = {
         tools: [{ name: 'tool1', toolSchema: {}, mcp_server_uuid: mockValidServerUuid }]
       };
       const mockReq = createMockRequest('POST', toolsPayload);
       // Mock server check
       mockWhere.mockResolvedValueOnce([{ uuid: mockValidServerUuid }]);
       const dbError = new Error('DB Upsert Failed');
       (dbError as any).code = '23505';
       mockReturning.mockRejectedValue(dbError); // Mock rejection

       const response = await toolsPostHandler(mockReq);
       const data = await response.json();

       expect(response.status).toBe(500);
       expect(data.error).toBe('Failed to process tools request');
       expect(data.details).toContain('Database error occurred during upsert');
     });
  });

  describe('GET /api/tools', () => {
     it('should return 401 if authentication fails', async () => {
      mockedAuthenticateApiKey.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) } as any);
      const mockReq = createMockRequest('GET');
      const response = await toolsGetHandler(mockReq);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('should fetch only ACTIVE tools by default', async () => {
       const mockReq = createMockRequest('GET');
       await toolsGetHandler(mockReq);

       expect(mockedDb.select).toHaveBeenCalled();
       // Check the where clause construction passed to the final mock
       expect(mockWhere).toHaveBeenCalledWith(
         and(
           eq(mcpServersTable.profile_uuid, mockProfile.uuid),
           eq(mcpServersTable.status, McpServerStatus.ACTIVE),
           eq(toolsTable.status, ToggleStatus.ACTIVE) // Default filter
         )
       );
    });

     it('should fetch tools with specific status if provided', async () => {
       const params = new URLSearchParams({ status: ToggleStatus.INACTIVE });
       const mockReq = createMockRequest('GET', undefined, params);
       await toolsGetHandler(mockReq);

       expect(mockedDb.select).toHaveBeenCalled();
       expect(mockWhere).toHaveBeenCalledWith(
         and(
           eq(mcpServersTable.profile_uuid, mockProfile.uuid),
           eq(mcpServersTable.status, McpServerStatus.ACTIVE),
           eq(toolsTable.status, ToggleStatus.INACTIVE) // Filter by provided status
         )
       );
     });

     it('should return fetched tools', async () => {
       const mockTools = [
         { mcp_server_uuid: 'uuid1', name: 'toolA', status: 'ACTIVE' },
         { mcp_server_uuid: 'uuid2', name: 'toolB', status: 'ACTIVE' },
       ];
       mockWhere.mockResolvedValue(mockTools); // Mock the final step

       const mockReq = createMockRequest('GET');
       const response = await toolsGetHandler(mockReq);
       const data = await response.json();

       expect(response.status).toBe(200);
       expect(data.results).toEqual(mockTools);
     });

      it('should handle database errors during fetch', async () => {
       const dbError = new Error('DB Select Failed');
       mockWhere.mockRejectedValue(dbError); // Mock rejection at the final step

       const mockReq = createMockRequest('GET');
       const response = await toolsGetHandler(mockReq);
       const data = await response.json();

       expect(response.status).toBe(500);
       expect(data.error).toContain('Internal server error while fetching tools');
     });
  });
});
