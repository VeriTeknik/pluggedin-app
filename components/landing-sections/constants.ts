/**
 * Shared constants for landing-page install snippets.
 *
 * Both DualInstallSnippet and McpProxySection render and copy the same
 * CLI invocations; keeping them in one place prevents the UI and the
 * clipboard target from drifting if the proxy package name changes.
 */

export const PROXY_COMMAND = 'npx -y @pluggedin/pluggedin-mcp-proxy@latest';

export const PLUGIN_COMMANDS = `/plugin marketplace add VeriTeknik/pluggedin-plugin
/plugin install pluggedin
/pluggedin:setup`;
