/**
 * Skipping the sandbox must require actually being Docker.
 *
 * `createMcpClientAndTransport` decided a server needed raw Docker socket
 * access — and therefore no bubblewrap/firejail — like this:
 *
 *   transformedCommand === 'docker' ||
 *   (transformedCommand === 'uvx' &&
 *    transformedArgs.some(arg => arg.toLowerCase().includes('docker')))
 *
 * A substring. Any uvx server with "docker" anywhere in its arguments —
 * `docker-utils`, `mydocker`, `--from some-docker-helper` — ran completely
 * unsandboxed, with the full filesystem the sandbox exists to withhold. The
 * flag was set by a branch whose own body was empty, so its only effect was to
 * disable the sandbox.
 *
 * Found by the 2026-09-06 re-scan and confirmed by reading the gate.
 *
 * A uvx package is not Docker. If one genuinely wraps Docker it opts out
 * explicitly with `applySandboxing: false`, which the caller already supports.
 */
import { describe, expect, it } from 'vitest';

import { requiresDockerSocket } from '@/lib/mcp/client-wrapper';

describe('requiresDockerSocket', () => {
  it('is true for the docker command itself', () => {
    expect(requiresDockerSocket('docker', ['run', 'x'])).toBe(true);
  });

  it.each([
    ['docker-utils', ['docker-utils']],
    ['a package merely containing the word', ['mcp-docker-helper']],
    ['a flag value', ['--from', 'some-docker-thing', 'pkg']],
    ['different case', ['DOCKER-tools']],
    ['a path', ['/opt/docker/whatever']],
  ])('is false for a uvx server whose args merely mention docker: %s', (_label, args) => {
    expect(requiresDockerSocket('uvx', args)).toBe(false);
  });

  it('is false for an ordinary uvx server', () => {
    expect(requiresDockerSocket('uvx', ['some-package'])).toBe(false);
  });

  it('is false for npx regardless of arguments', () => {
    expect(requiresDockerSocket('npx', ['-y', 'docker'])).toBe(false);
  });

  it('does not treat a command that merely starts with docker as docker', () => {
    // `docker-compose` is a different binary and does not imply the daemon
    // socket is required by this server.
    expect(requiresDockerSocket('docker-compose', ['up'])).toBe(false);
  });
});
