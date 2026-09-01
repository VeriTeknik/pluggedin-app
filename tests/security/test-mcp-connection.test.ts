import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => {
  const exec = vi.fn((_c: string, _o: any, cb: any) => (typeof cb === 'function' ? cb : _o)(null, { stdout: '', stderr: '' }));
  const execFile = vi.fn((_f: string, _a: string[], _o: any, cb: any) => (typeof cb === 'function' ? cb : _o)(null, { stdout: '/usr/bin/x', stderr: '' }));
  return { exec, execFile, default: { exec, execFile } };
});
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {}, getAuthSession: vi.fn() }));

const { getServerSession } = vi.mocked(await import('next-auth'));
const { exec, execFile } = vi.mocked(await import('child_process'));
const { testMcpConnection } = await import('@/app/actions/test-mcp-connection');
const { McpServerType } = await import('@/db/schema');

const PAYLOAD = 'x; touch /tmp/PWNED #';

function stdio(command: string) {
  return { name: 'test', type: McpServerType.STDIO, command, args: [] } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any);
});

describe('testMcpConnection STDIO command handling', () => {
  it('never hands the command to a shell', async () => {
    await testMcpConnection(stdio(PAYLOAD)).catch(() => undefined);

    expect(exec).not.toHaveBeenCalled();
    for (const call of execFile.mock.calls) {
      expect(String(call[0])).not.toContain(PAYLOAD);
    }
  });

  it('rejects a command carrying shell metacharacters', async () => {
    const result = await testMcpConnection(stdio(PAYLOAD));

    expect(result.success).toBe(false);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('rejects a command outside the allowlist', async () => {
    const result = await testMcpConnection(stdio('curl'));

    expect(result.success).toBe(false);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller before touching the command', async () => {
    getServerSession.mockResolvedValue(null as any);

    const result = await testMcpConnection(stdio('npx'));

    expect(result.success).toBe(false);
    expect(exec).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('still accepts an allowlisted command', async () => {
    const result = await testMcpConnection(stdio('npx'));

    expect(result.success).toBe(true);
  });
});
