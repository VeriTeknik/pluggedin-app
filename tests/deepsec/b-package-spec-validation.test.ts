import { describe, expect, it } from 'vitest';

import {
  validateNpmPackageSpec,
  validatePackageName,
  validatePythonPackageName,
} from '@/lib/security/package-name';

/**
 * A package name is lifted out of a user-supplied args array and handed to
 * pnpm/uv, which run on the host before the MCP sandbox exists. Both installers
 * also accept things that are not names at all - archive URLs, VCS specs, local
 * paths - and fetch or read them themselves, with none of the application's SSRF
 * protection. Those forms must not validate as a package name.
 */
const NON_REGISTRY_SPECS = [
  'http://127.0.0.1:8080/package.tgz',
  'https://10.0.0.5:8080/package.tar.gz',
  'http://169.254.169.254/latest/meta-data',
  'git+https://internal.example/repo.git',
  'git+ssh://git@internal.example/repo.git',
  'git://internal.example/repo.git',
  'github:owner/repo',
  'file:../other-server/pnpm',
  'npm:evil-package',
];

describe('validatePackageName (shared grammar)', () => {
  it.each(NON_REGISTRY_SPECS)('rejects %j', (spec) => {
    expect(validatePackageName(spec).valid).toBe(false);
  });

  it.each([
    '@modelcontextprotocol/server-filesystem',
    '@smithery/cli@latest',
    'mcp-server-fetch',
    'zope.interface',
    'ghcr.io/veriteknik/pluggedin-app',
    'node:20-alpine',
  ])('still accepts registry name %j', (name) => {
    expect(validatePackageName(name).valid).toBe(true);
  });
});

describe('validateNpmPackageSpec', () => {
  it.each([
    ...NON_REGISTRY_SPECS,
    // GitHub shorthand: npm resolves owner/repo to a git fetch.
    'owner/repo',
    // A local tarball in the install directory.
    'evil.tgz',
    'package.tar.gz',
    // An alias or URL hidden in the version position.
    'express@npm:evil-package',
    'express@https://10.0.0.5/x.tgz',
    'express@github:owner/repo',
    'express@file:../x',
    '$(id)',
    '-rf',
    '',
  ])('rejects %j', (spec) => {
    expect(validateNpmPackageSpec(spec).valid).toBe(false);
  });

  it.each([
    'express',
    'express@4.18.2',
    '@modelcontextprotocol/server-filesystem',
    '@modelcontextprotocol/server-filesystem@0.6.2',
    '@smithery/cli@latest',
    '@21st-dev/magic-mcp',
    'mcp-remote',
    'JSONStream',
  ])('accepts %j', (spec) => {
    expect(validateNpmPackageSpec(spec).valid).toBe(true);
  });
});

describe('validatePythonPackageName', () => {
  it.each([
    ...NON_REGISTRY_SPECS,
    // PEP 508 direct reference: `name@url` is a URL requirement, not a version.
    'evil@https://10.0.0.5/x.tar.gz',
    'evil@http://127.0.0.1/x.whl',
    // Local archives and directories.
    './local-dir',
    '/abs/path',
    'evil.tar.gz',
    'evil-1.0-py3-none-any.whl',
    'owner/repo',
    '-e',
    '',
  ])('rejects %j', (spec) => {
    expect(validatePythonPackageName(spec).valid).toBe(false);
  });

  it.each(['mcp-server-fetch', 'mcp_server_git', 'zope.interface', 'Django', 'a'])(
    'accepts %j',
    (name) => {
      expect(validatePythonPackageName(name).valid).toBe(true);
    }
  );
});
