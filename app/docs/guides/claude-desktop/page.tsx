'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { getFirstApiKey } from '@/app/actions/api-keys';
import { ApiKeyDisplay } from '@/components/docs/api-key-display';
import { ConfigDisplay } from '@/components/docs/config-display';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';

export default function ClaudeDesktopGuidePage() {
  const { isAuthenticated } = useAuth();
  const { currentProject } = useProjects();
  const { data: apiKey } = useSWR(
    isAuthenticated && currentProject?.uuid ? `${currentProject?.uuid}/api-keys/getFirst` : null,
    () => getFirstApiKey(currentProject?.uuid || '')
  );
  const { t } = useTranslation();

  const apiKeyValue = isAuthenticated && apiKey?.api_key ? apiKey.api_key : undefined;

  const claudeDesktopConfig = {
    mcpServers: {
      PluggedinMCP: {
        command: 'npx',
        args: ['-y', '@pluggedin/pluggedin-mcp-proxy@latest'],
        env: {
          PLUGGEDIN_API_KEY: apiKeyValue || '<YOUR_PLUGGEDIN_API_KEY>',
        },
      },
    },
  };

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
        <h1 className="text-4xl font-bold mb-4">Claude Desktop Setup</h1>
        <p className="text-lg text-muted-foreground">
          Configure Plugged.in MCP with the Claude Desktop application for seamless AI workflow integration.
        </p>
      </div>

      {/* Prerequisites */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Prerequisites</h2>
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 rounded-lg">
          <ul className="list-disc list-inside space-y-2">
            <li>Claude Desktop application installed</li>
            <li>Node.js installed (for npx command)</li>
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
        <ApiKeyDisplay apiKey={apiKeyValue} />
      </section>

      {/* Step-by-step Instructions */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-6">Setup Instructions</h2>
        
        <div className="space-y-8">
          {/* Step 1 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 1: Open Claude Desktop Settings</h3>
            <p className="text-muted-foreground mb-4">
              Click on the settings gear icon in Claude Desktop to access the configuration menu.
            </p>
          </div>

          {/* Step 2 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 2: Locate Configuration File</h3>
            <p className="text-muted-foreground mb-4">
              Navigate to the MCP configuration section. The configuration file is located at:
            </p>
            <div className="bg-muted p-4 rounded-lg font-mono text-sm mb-4">
              <div><strong>macOS:</strong> ~/Library/Application Support/Claude/claude_desktop_config.json</div>
              <div><strong>Windows:</strong> %APPDATA%\Claude\claude_desktop_config.json</div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 3: Add Plugged.in MCP Configuration</h3>
            <p className="text-muted-foreground mb-4">
              Copy and paste the following configuration into your Claude Desktop config file:
            </p>
            <ConfigDisplay 
              config={claudeDesktopConfig}
              copyMessage="Claude Desktop configuration copied to clipboard"
              className="mb-4"
            />
          </div>

          {/* Step 4 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 4: Save and Restart</h3>
            <p className="text-muted-foreground mb-4">
              Save the configuration file and restart Claude Desktop for changes to take effect.
            </p>
          </div>

          {/* Step 5 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 5: Verify Connection</h3>
            <p className="text-muted-foreground mb-4">
              Check that Plugged.in MCP is successfully connected by looking for the MCP indicator in Claude Desktop.
              You should see &quot;PluggedinMCP&quot; listed in your available MCP servers.
            </p>
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Troubleshooting</h2>
        <div className="space-y-4">
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">MCP server not appearing</h4>
            <p className="text-muted-foreground">
              Ensure you&apos;ve restarted Claude Desktop after saving the configuration. 
              Check that your API key is valid and properly formatted.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">NPX command not found</h4>
            <p className="text-muted-foreground">
              Make sure Node.js is installed on your system. You can download it from{' '}
              <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                nodejs.org
              </a>
            </p>
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
              Learn how to use MCP servers effectively with Claude Desktop
            </p>
          </Link>
          <Link href="/search" className="p-4 bg-card dark:bg-muted rounded-lg hover:shadow-md transition-shadow">
            <h4 className="font-semibold mb-2">Discover MCP Servers</h4>
            <p className="text-muted-foreground text-sm">
              Browse and install additional MCP servers from our marketplace
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}