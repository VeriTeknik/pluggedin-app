import { vi } from 'vitest';

// Mock database utilities
export const createMockDb = () => ({
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockReturnThis(),
  execute: vi.fn(),
  query: {
    users: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    accounts: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    projects: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    profiles: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    mcpServers: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    tools: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
});

// Mock authentication
export const createMockAuthResult = (overrides = {}) => ({
  success: true,
  apiKey: {
    uuid: 'test-api-key-uuid',
    project_uuid: 'test-project-uuid',
    name: 'Test API Key',
    api_key: 'test-api-key-value',
    created_at: new Date(),
    ...overrides,
  },
  activeProfile: {
    uuid: 'test-profile-uuid',
    name: 'Test Profile',
    project_uuid: 'test-project-uuid',
    created_at: new Date(),
    ...overrides,
  },
});

// Mock request helpers
export const createMockRequest = (
  method: string,
  body?: any,
  searchParams?: URLSearchParams,
  headers?: Record<string, string>
): Request => {
  const url = searchParams 
    ? `http://localhost:3000/test?${searchParams.toString()}` 
    : 'http://localhost:3000/test';
    
  const requestOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  
  if (body && method !== 'GET') {
    requestOptions.body = JSON.stringify(body);
  }
  
  return new Request(url, requestOptions);
};

// Mock MCP server configuration
export const createMockMcpServer = (overrides = {}) => ({
  uuid: 'test-server-uuid',
  profile_uuid: 'test-profile-uuid',
  name: 'Test MCP Server',
  description: 'Test server description',
  type: 'STDIO',
  command: 'node',
  args: ['test-server.js'],
  status: 'ACTIVE',
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

// Mock tool configuration
export const createMockTool = (overrides = {}) => ({
  uuid: 'test-tool-uuid',
  mcp_server_uuid: 'test-server-uuid',
  name: 'test_tool',
  description: 'Test tool description',
  toolSchema: {
    type: 'object',
    properties: {
      input: { type: 'string' },
    },
  },
  status: 'ACTIVE',
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

// Mock user profile
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  username: 'testuser',
  bio: 'Test user bio',
  avatar_url: null,
  is_public: true,
  language: 'en',
  emailVerified: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

// Mock profile
export const createMockProfile = (overrides = {}) => ({
  uuid: 'test-profile-uuid',
  project_uuid: 'test-project-uuid',
  name: 'Test Profile',
  created_at: new Date(),
  ...overrides,
});

// Mock project
export const createMockProject = (overrides = {}) => ({
  uuid: 'test-project-uuid',
  user_id: 'test-user-id',
  name: 'Test Project',
  active_profile_uuid: 'test-profile-uuid',
  created_at: new Date(),
  ...overrides,
});