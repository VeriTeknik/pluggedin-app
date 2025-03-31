import { exec } from 'child_process'; // Node built-in
// import { promisify } from 'util'; // No longer needed due to mock
import { beforeEach,describe, expect, it, vi } from 'vitest'; // Testing framework

import { authenticateApiKey } from '@/app/api/auth'; // Local imports
import { POST as discoverPostHandler } from '@/app/api/tools/discover/route';

// Mock dependencies
vi.mock('child_process');
vi.mock('util', async (importOriginal) => {
  const originalUtil = await importOriginal<typeof import('util')>();
  return {
    ...originalUtil,
    promisify: vi.fn((fn) => fn), // Mock promisify to just return the function passed to it
  };
});
vi.mock('@/app/api/auth');

const mockedExec = vi.mocked(exec);
const mockedAuthenticateApiKey = vi.mocked(authenticateApiKey);

// Helper to create mock NextRequest
function createMockRequest(method: string): Request {
  const url = `http://localhost/api/tools/discover`;
  const requestOptions: RequestInit = { method };
  return new Request(url, requestOptions);
}

describe('Tools Discover API (/api/tools/discover)', () => {
  const mockProfile = { uuid: 'profile-uuid-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default successful authentication
    mockedAuthenticateApiKey.mockResolvedValue({ activeProfile: mockProfile } as any);
    // Default successful exec mock
    mockedExec.mockImplementation((command, options, callback) => {
      if (callback) {
        // Simulating the callback structure of exec
        callback(null, 'Script output', ''); // (error, stdout, stderr)
      }
      // Return a mock ChildProcess object if needed for more complex scenarios
      return null as any;
    });
  });

  it('should return 401 if authentication fails', async () => {
    mockedAuthenticateApiKey.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) } as any);
    const mockReq = createMockRequest('POST');
    const response = await discoverPostHandler(mockReq);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('should execute the discovery script successfully', async () => {
    const mockReq = createMockRequest('POST');
    const response = await discoverPostHandler(mockReq);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('completed successfully');
    expect(data.details).toBe('Script output');
    expect(mockedExec).toHaveBeenCalledTimes(1);
    expect(mockedExec).toHaveBeenCalledWith(
      expect.stringContaining('node "'), // Check node command
      expect.stringContaining('scripts/discover-and-report-tools.js"'), // Check script path
      expect.any(Object), // Options object might be passed
      expect.any(Function) // Callback function
    );
  });

  it('should return 500 if script execution fails', async () => {
    const scriptError = new Error('Script failed') as any;
    scriptError.stdout = 'Partial output';
    scriptError.stderr = 'Error details';
    scriptError.code = 1; // Non-zero exit code
    mockedExec.mockImplementation((command, options, callback) => {
      if (callback) {
        callback(scriptError, scriptError.stdout, scriptError.stderr);
      }
      return null as any;
    });

    const mockReq = createMockRequest('POST');
    const response = await discoverPostHandler(mockReq);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Error executing tool discovery script');
    expect(data.details).toContain('Script exited with code 1');
    expect(data.details).toContain('Stderr: Error details');
    expect(data.stdout).toBe('Partial output');
    expect(mockedExec).toHaveBeenCalledTimes(1);
  });

  it('should return 500 if script is not found (ENOENT)', async () => {
    const scriptError = new Error('ENOENT error') as any;
    scriptError.code = 'ENOENT'; // Specific error code
    scriptError.stdout = '';
    scriptError.stderr = '';
     mockedExec.mockImplementation((command, options, callback) => {
      if (callback) {
        callback(scriptError, scriptError.stdout, scriptError.stderr);
      }
      return null as any;
    });

    const mockReq = createMockRequest('POST');
    const response = await discoverPostHandler(mockReq);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Error executing tool discovery script');
    expect(data.details).toContain('Script not found at path');
  });

   it('should return 500 if script permission is denied (EACCES)', async () => {
    const scriptError = new Error('Permission denied') as any;
    scriptError.code = 'EACCES'; // Specific error code
    scriptError.stdout = '';
    scriptError.stderr = '';
     mockedExec.mockImplementation((command, options, callback) => {
      if (callback) {
        callback(scriptError, scriptError.stdout, scriptError.stderr);
      }
      return null as any;
    });

    const mockReq = createMockRequest('POST');
    const response = await discoverPostHandler(mockReq);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Error executing tool discovery script');
    expect(data.details).toContain('Permission denied');
  });

});
