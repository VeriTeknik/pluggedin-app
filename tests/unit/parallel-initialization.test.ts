import { describe, it, expect, vi } from 'vitest';

// Mock the external library
vi.mock('@h1deya/langchain-mcp-tools', () => ({
  convertMcpToLangchainTools: vi.fn((config) => {
    const serverNames = Object.keys(config);
    return Promise.resolve({
      tools: serverNames.map(name => ({ name: `${name}-tool` })),
      cleanup: vi.fn(),
    });
  }),
}));

vi.mock('@/app/actions/mcp-playground', () => ({
  addServerLogForProfile: vi.fn(() => Promise.resolve()),
}));

describe('Parallel Initialization - Mixed Transport Types', () => {
  it('should initialize STDIO and STREAMABLE_HTTP servers in parallel', async () => {
    const { progressivelyInitializeMcpServers } = await import('@/app/actions/progressive-mcp-initialization');

    const mcpServersConfig = {
      'stdio-server': {
        name: 'stdio-server',
        type: 'STDIO',
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
      },
      'http-server': {
        name: 'http-server',
        type: 'STREAMABLE_HTTP',
        transport: 'streamable_http',
        url: 'https://api.example.com',
        streamableHTTPOptions: {
          requestInit: {
            headers: {
              'Authorization': 'Bearer test-token',
            },
          },
        },
      },
    };

    const result = await progressivelyInitializeMcpServers(
      mcpServersConfig,
      'test-profile-uuid',
      {
        logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
        perServerTimeout: 10000,
        totalTimeout: 30000,
        maxRetries: 1,
        skipHealthChecks: true,
        llmProvider: 'anthropic',
      }
    );

    // Both servers should initialize successfully
    expect(result.tools).toHaveLength(2);
    expect(result.initStatus).toHaveLength(2);
    expect(result.initStatus.every(s => s.status === 'success')).toBe(true);
    expect(result.failedServers).toHaveLength(0);
  });

  it('should isolate failures - one server failure should not affect others', async () => {
    const { convertMcpToLangchainTools } = await import('@h1deya/langchain-mcp-tools');
    const { progressivelyInitializeMcpServers } = await import('@/app/actions/progressive-mcp-initialization');

    // Mock to fail for failing-server, succeed for working-server
    (convertMcpToLangchainTools as any).mockImplementation((config: any) => {
      const serverNames = Object.keys(config);
      const serverName = serverNames[0];

      if (serverName === 'failing-server') {
        return Promise.reject(new Error('Server initialization failed'));
      }

      return Promise.resolve({
        tools: serverNames.map(name => ({ name: `${name}-tool` })),
        cleanup: vi.fn(),
      });
    });

    const mcpServersConfig = {
      'failing-server': {
        name: 'failing-server',
        type: 'STDIO',
        transport: 'stdio',
        command: 'nonexistent',
      },
      'working-server': {
        name: 'working-server',
        type: 'STREAMABLE_HTTP',
        transport: 'streamable_http',
        url: 'https://api.example.com',
      },
    };

    const result = await progressivelyInitializeMcpServers(
      mcpServersConfig,
      'test-profile-uuid',
      {
        logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
        perServerTimeout: 10000,
        totalTimeout: 30000,
        maxRetries: 0, // No retries for faster test
        skipHealthChecks: true,
        llmProvider: 'anthropic',
      }
    );

    // One server should fail, one should succeed
    expect(result.initStatus).toHaveLength(2);
    expect(result.failedServers).toContain('failing-server');
    expect(result.failedServers).not.toContain('working-server');
  });

  it('should respect overall timeout', async () => {
    const { convertMcpToLangchainTools } = await import('@h1deya/langchain-mcp-tools');
    const { progressivelyInitializeMcpServers } = await import('@/app/actions/progressive-mcp-initialization');

    // Mock server to take longer than timeout
    convertMcpToLangchainTools.mockImplementationOnce(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({ tools: [], cleanup: vi.fn() });
        }, 5000); // 5 second delay
      });
    });

    const mcpServersConfig = {
      'slow-server': {
        name: 'slow-server',
        type: 'STDIO',
        transport: 'stdio',
        command: 'node',
      },
    };

    await expect(
      progressivelyInitializeMcpServers(
        mcpServersConfig,
        'test-profile-uuid',
        {
          logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
          perServerTimeout: 10000,
          totalTimeout: 1000, // 1 second overall timeout
          maxRetries: 1,
          skipHealthChecks: true,
          llmProvider: 'anthropic',
        }
      )
    ).rejects.toThrow('timed out');
  }, 10000); // Increase test timeout
});
