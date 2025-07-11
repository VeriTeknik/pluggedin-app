import { vi } from 'vitest';
import type { Session } from 'next-auth';
import { McpServerSource, McpServerStatus, McpServerType } from '@/db/schema';

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
  transaction: vi.fn((callback) => callback({
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  })),
  query: {
    users: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    accounts: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    projectsTable: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    profilesTable: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    mcpServersTable: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    sharedMcpServersTable: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    registryServersTable: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    toolsTable: {
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
  updated_at: new Date(),
  ...overrides,
});

// Mock project
export const createMockProject = (overrides = {}) => ({
  uuid: 'test-project-uuid',
  user_id: 'test-user-id',
  name: 'Test Project',
  active_profile_uuid: 'test-profile-uuid',
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

// Mock session
export const createMockSession = (userOverrides = {}): Session => ({
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    image: null,
    ...userOverrides,
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
});

// Mock shared MCP server
export const createMockSharedServer = (overrides = {}) => ({
  uuid: 'test-shared-server-uuid',
  server_uuid: 'test-server-uuid',
  profile_uuid: 'test-profile-uuid',
  title: 'Test Community Server',
  description: 'Test community server description',
  template: {
    name: 'test-community-server',
    type: McpServerType.STDIO,
    command: 'npx',
    args: ['test-mcp-server'],
    env: {},
  },
  is_public: true,
  requires_credentials: false,
  is_claimed: false,
  claimed_by_user_id: null,
  claimed_at: null,
  registry_server_uuid: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

// Mock registry server
export const createMockRegistryServer = (overrides = {}) => ({
  uuid: 'test-registry-server-uuid',
  registry_id: 'registry-123',
  name: 'test-mcp-server',
  github_owner: 'testuser',
  github_repo: 'test-mcp-server',
  repository_url: 'https://github.com/testuser/test-mcp-server',
  description: 'Test registry server',
  is_claimed: true,
  is_published: true,
  claimed_by_user_id: 'test-user-id',
  claimed_at: new Date(),
  published_at: new Date(),
  metadata: {
    name: 'io.github.testuser/test-mcp-server',
    packages: [{
      registry_name: 'npm',
      name: 'test-mcp-server',
      version: 'latest',
    }],
  },
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

// Mock wizard data
export const createMockWizardData = {
  npm: (overrides = {}) => ({
    step: 'package',
    serverType: 'stdio' as const,
    deploymentType: 'npm' as const,
    npmPackage: 'test-mcp-server',
    owner: 'testuser',
    repo: 'test-mcp-server',
    mainBranch: 'main',
    packageManager: 'npm' as const,
    packageCommand: 'npx',
    description: 'Test MCP server for npm',
    envVars: [],
    ...overrides,
  }),
  
  docker: (overrides = {}) => ({
    step: 'package',
    serverType: 'stdio' as const,
    deploymentType: 'docker' as const,
    dockerImage: 'testuser/test-mcp-server',
    owner: 'testuser',
    repo: 'test-mcp-server',
    mainBranch: 'main',
    packageManager: 'docker' as const,
    description: 'Test MCP server for docker',
    envVars: [],
    ...overrides,
  }),
  
  pypi: (overrides = {}) => ({
    step: 'package',
    serverType: 'stdio' as const,
    deploymentType: 'pypi' as const,
    pypiPackage: 'test-mcp-server',
    owner: 'testuser',
    repo: 'test-mcp-server',
    mainBranch: 'main',
    packageManager: 'pip' as const,
    packageCommand: 'python -m',
    description: 'Test MCP server for pypi',
    envVars: [],
    ...overrides,
  }),
};

// Mock GitHub API responses
export const mockGitHubResponses = {
  validRepo: {
    id: 123456789,
    name: 'test-mcp-server',
    full_name: 'testuser/test-mcp-server',
    owner: {
      login: 'testuser',
      id: 12345,
    },
    private: false,
    description: 'Test MCP server repository',
    default_branch: 'main',
    permissions: {
      admin: true,
      push: true,
      pull: true,
    },
  },
  
  repoNotFound: {
    message: 'Not Found',
    documentation_url: 'https://docs.github.com/rest',
  },
  
  noPermissions: {
    id: 987654321,
    name: 'other-mcp-server',
    full_name: 'otheruser/other-mcp-server',
    owner: {
      login: 'otheruser',
      id: 54321,
    },
    private: false,
    permissions: {
      admin: false,
      push: false,
      pull: true,
    },
  },
};

// Mock registry API responses
export const mockRegistryApiResponses = {
  publishSuccess: {
    id: 'registry-123',
    status: 'published',
    message: 'Server published successfully',
  },
  
  publishConflict: {
    error: 'Server already exists',
    status: 409,
    message: 'A server with this repository already exists',
  },
  
  authError: {
    error: 'Unauthorized',
    status: 401,
    message: 'Invalid authentication token',
  },
};

// Mock fetch responses
export const createMockFetchResponse = (data: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  json: vi.fn().mockResolvedValue(data),
  text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  headers: new Headers({
    'content-type': 'application/json',
  }),
});

// Mock GitHub account
export const createMockGitHubAccount = (overrides = {}) => ({
  userId: 'test-user-id',
  provider: 'github',
  providerAccountId: '12345',
  access_token: 'ghp_mocktoken123',
  token_type: 'bearer',
  scope: 'repo,user',
  ...overrides,
});