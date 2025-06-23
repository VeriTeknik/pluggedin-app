'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { getFirstApiKey } from '@/app/actions/api-keys';
import { ApiKeyDisplay } from '@/components/docs/api-key-display';
import { TerminalDisplay } from '@/components/docs/terminal-display';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';

export default function ClaudeCodeGuidePage() {
  const { isAuthenticated } = useAuth();
  const { currentProject } = useProjects();
  const { data: apiKey } = useSWR(
    isAuthenticated && currentProject?.uuid ? `${currentProject?.uuid}/api-keys/getFirst` : null,
    () => getFirstApiKey(currentProject?.uuid || '')
  );
  const { t } = useTranslation();

  const apiKeyValue = isAuthenticated && apiKey?.api_key ? apiKey.api_key : '<YOUR_PLUGGEDIN_API_KEY>';

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Navigation */}
      <div className="mb-8">
        <Link href="/docs/guides" className="inline-flex items-center text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Guides
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Claude Code Setup</h1>
        <p className="text-lg text-muted-foreground">
          Configure Plugged.in MCP with Claude Code CLI for powerful command-line AI interactions.
        </p>
      </div>

      {/* Prerequisites */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Prerequisites</h2>
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 rounded-lg">
          <ul className="list-disc list-inside space-y-2">
            <li>Claude Code CLI installed and configured</li>
            <li>Terminal or command prompt access</li>
            <li>Plugged.in account with API key</li>
          </ul>
        </div>
      </section>

      {/* API Key Section */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Your API Key</h2>
        <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 rounded-lg mb-4">
          <p className="font-medium">
            You&apos;ll need your Plugged.in API key for configuration.{' '}
            {isAuthenticated ? (
              <Link
                href="/api-keys"
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
              >
                Manage your API keys here
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
              >
                Sign in to get your API key
              </Link>
            )}
          </p>
        </div>
        <ApiKeyDisplay apiKey={isAuthenticated && apiKey?.api_key ? apiKey.api_key : undefined} />
      </section>

      {/* Step-by-step Instructions */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-6">Setup Instructions</h2>
        
        <div className="space-y-8">
          {/* Step 1 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 1: Check Claude Code MCP Commands</h3>
            <p className="text-muted-foreground mb-4">
              First, verify that Claude Code MCP functionality is available by checking the help:
            </p>
            <TerminalDisplay 
              command="claude mcp --help"
              output={[
                "Usage: claude mcp [command] [options]",
                "Commands:",
                "  add <name> <command>  Add a new MCP server",
                "  list                 List all MCP servers", 
                "  remove <name>        Remove an MCP server"
              ]}
              className="mb-4"
            />
          </div>

          {/* Step 2 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 2: Check Current MCP Servers</h3>
            <p className="text-muted-foreground mb-4">
              List any existing MCP servers to see the current configuration:
            </p>
            <TerminalDisplay 
              command="claude mcp list"
              output={["No MCP servers configured. Run `claude mcp add` to add servers."]}
              className="mb-4"
            />
          </div>

          {/* Step 3 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 3: Add Plugged.in MCP Server</h3>
            <p className="text-muted-foreground mb-4">
              Run the following command to add Plugged.in MCP server to your Claude Code configuration:
            </p>
            <TerminalDisplay 
              command={`claude mcp add PluggedIn npx @pluggedin/pluggedin-mcp-proxy@latest -e PLUGGEDIN_API_KEY=${apiKeyValue}`}
              className="mb-4"
            />
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 rounded-lg mb-4">
              <p className="text-sm">
                <strong>Note:</strong> This command adds the Plugged.in MCP server with your API key as an environment variable.
                The server will be available for use in your Claude Code sessions.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 4: Verify Installation</h3>
            <p className="text-muted-foreground mb-4">
              After adding the server, verify that it was installed correctly:
            </p>
            <TerminalDisplay 
              command="claude mcp list"
              output={["PluggedIn: @pluggedin/pluggedin-mcp-proxy"]}
              className="mb-4"
            />
            <p className="text-muted-foreground mb-4">
              You can also get detailed information about the server:
            </p>
            <TerminalDisplay 
              command="claude mcp get PluggedIn"
              output={[
                "PluggedIn:",
                "  Scope: Local (private to you in this project)",
                "  Type: stdio",
                "  Command: @pluggedin/pluggedin-mcp-proxy",
                "  Environment:",
                "    PLUGGEDIN_API_KEY=pg_in_..."
              ]}
              className="mb-4"
            />
          </div>
        </div>
      </section>

      {/* Usage */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Using Plugged.in MCP</h2>
        <div className="p-4 bg-card dark:bg-muted rounded-lg">
          <p className="text-muted-foreground mb-4">
            Once configured, the Plugged.in MCP server will be available in your Claude Code sessions. 
            You can access all your configured MCP servers and tools through the unified proxy interface.
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Access multiple MCP servers through a single connection</li>
            <li>Unified authentication using your Plugged.in API key</li>
            <li>Automatic discovery of available tools and resources</li>
            <li>Enhanced security and monitoring features</li>
          </ul>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Troubleshooting</h2>
        <div className="space-y-4">
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Command not found: claude</h4>
            <p className="text-muted-foreground">
              Make sure Claude Code CLI is properly installed and added to your PATH. 
              You can install it from{' '}
              <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                claude.ai/code
              </a>
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">MCP server fails to start</h4>
            <p className="text-muted-foreground">
              Check that your API key is valid and that you have an active internet connection. 
              You can verify your API key in the{' '}
              <Link href="/api-keys" className="text-blue-600 hover:underline">
                API Keys section
              </Link>
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Remove the server</h4>
            <p className="text-muted-foreground">
              If you need to remove the Plugged.in MCP server, use:
            </p>
            <div className="mt-2">
              <TerminalDisplay 
                command="claude mcp remove PluggedIn"
                className="mt-2"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Next Steps</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/docs/tutorials" className="p-4 bg-card dark:bg-muted rounded-lg hover:shadow-md transition-shadow">
            <h4 className="font-semibold mb-2">Explore Tutorials</h4>
            <p className="text-muted-foreground text-sm">
              Learn advanced Claude Code techniques with MCP servers
            </p>
          </Link>
          <Link href="/search" className="p-4 bg-card dark:bg-muted rounded-lg hover:shadow-md transition-shadow">
            <h4 className="font-semibold mb-2">Discover MCP Servers</h4>
            <p className="text-muted-foreground text-sm">
              Browse and configure additional MCP servers for your workflow
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}