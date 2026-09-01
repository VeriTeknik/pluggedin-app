import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => {
  const exec = vi.fn((_cmd: string, _opts: any, cb: any) => {
    (typeof cb === 'function' ? cb : _opts)(null, { stdout: '', stderr: '' });
  });
  const execFile = vi.fn((_file: string, _args: string[], _opts: any, cb: any) => {
    (typeof cb === 'function' ? cb : _opts)(null, { stdout: '', stderr: '' });
  });
  const spawn = vi.fn(() => ({ on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } }));
  return { exec, execFile, spawn, default: { exec, execFile, spawn } };
});
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    access: vi.fn(async () => { throw new Error('ENOENT'); }),
    readFile: vi.fn(async () => '{}'),
    readdir: vi.fn(async () => []),
    stat: vi.fn(async () => ({ isDirectory: () => true, size: 0 })),
    rm: vi.fn(async () => undefined),
  },
}));

const { exec, execFile } = vi.mocked(await import('child_process'));

/** The payload from the report: a metacharacter inside an args entry. */
const PAYLOAD = 'evil-package; touch /tmp/PWNED #';

describe('package manager handlers never hand a package name to a shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['pnpm', '@/lib/mcp/package-manager/handlers/pnpm-handler'],
    ['uv', '@/lib/mcp/package-manager/handlers/uv-handler'],
    ['docker', '@/lib/mcp/package-manager/handlers/docker-handler'],
  ])('%s handler builds no shell string containing the package name', async (_name, mod) => {
    const handlerModule: any = await import(mod);
    const HandlerClass = Object.values(handlerModule).find(
      (v: any) => typeof v === 'function' && /Handler$/.test(v.name)
    ) as any;
    const handler = new HandlerClass();

    await handler
      .install({ packageName: PAYLOAD, serverUuid: '11111111-1111-4111-8111-111111111111' })
      .catch(() => undefined);

    // `exec` parses through /bin/sh. Nothing may reach it at all.
    expect(exec).not.toHaveBeenCalled();

    // Whatever did run must have passed the name as its own argv entry, never
    // spliced into a command string.
    for (const call of execFile.mock.calls) {
      const [file, args] = call as unknown as [string, string[]];
      expect(file).not.toContain(PAYLOAD);
      expect(Array.isArray(args)).toBe(true);
      for (const arg of args) {
        expect(typeof arg).toBe('string');
      }
    }
  });

  it.each([
    ['pnpm', '@/lib/mcp/package-manager/handlers/pnpm-handler'],
    ['uv', '@/lib/mcp/package-manager/handlers/uv-handler'],
    ['docker', '@/lib/mcp/package-manager/handlers/docker-handler'],
  ])('%s handler rejects a malformed package name before running anything', async (_name, mod) => {
    const handlerModule: any = await import(mod);
    const HandlerClass = Object.values(handlerModule).find(
      (v: any) => typeof v === 'function' && /Handler$/.test(v.name)
    ) as any;
    const handler = new HandlerClass();

    await expect(
      handler.install({ packageName: PAYLOAD, serverUuid: '11111111-1111-4111-8111-111111111111' })
    ).rejects.toThrow();

    expect(exec).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });
});
