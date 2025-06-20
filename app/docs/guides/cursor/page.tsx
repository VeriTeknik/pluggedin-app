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

export default function CursorGuidePage() {
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
        <h1 className="text-4xl font-bold mb-4">Cursor Setup</h1>
        <p className="text-lg text-muted-foreground">
          Integrate Plugged.in MCP with Cursor AI editor for enhanced coding assistance and workflow automation.
        </p>
      </div>

      {/* Prerequisites */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Prerequisites</h2>
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 rounded-lg">
          <ul className="list-disc list-inside space-y-2">
            <li>Cursor AI editor installed</li>
            <li>Node.js and npm installed on your system</li>
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
            <h3 className="text-xl font-semibold mb-2">Step 1: Open Cursor Settings</h3>
            <p className="text-muted-foreground mb-4">
              Open Cursor and navigate to Cursor Settings to access the MCP configuration section.
            </p>
            <div className="p-4 bg-muted rounded-lg mb-4">
              <p className="text-sm">
                <strong>Tip:</strong> You can access settings via the menu: Cursor → Settings → Features
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 2: Navigate to MCP Servers</h3>
            <p className="text-muted-foreground mb-4">
              In the Features section, find &quot;MCP Servers&quot; and click &quot;Add new MCP Server&quot; to configure a new server.
            </p>
          </div>

          {/* Step 3 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 3: Add Plugged.in MCP Server</h3>
            <p className="text-muted-foreground mb-4">
              Use the following command to set up the Plugged.in MCP server:
            </p>
            <TerminalDisplay 
              command={`npx -y @pluggedin/pluggedin-mcp-proxy --pluggedin-api-key ${apiKeyValue}`}
              className="mb-4"
            />
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 rounded-lg mb-4">
              <p className="text-sm">
                <strong>Note:</strong> This command will download and run the latest version of the Plugged.in MCP proxy
                with your API key for authentication.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 4: Apply Configuration</h3>
            <p className="text-muted-foreground mb-4">
              Save the configuration and apply the changes to enable the Plugged.in MCP server in Cursor.
              The server should now appear in your list of available MCP servers.
            </p>
          </div>

          {/* Step 5 */}
          <div className="border-l-4 border-gray-300 pl-6">
            <h3 className="text-xl font-semibold mb-2">Step 5: Test the Connection</h3>
            <p className="text-muted-foreground mb-4">
              Verify that the Plugged.in MCP server is working by checking the MCP server status in Cursor.
              You should see it listed as &quot;Connected&quot; or &quot;Active&quot; in the MCP servers section.
            </p>
          </div>
        </div>
      </section>

      {/* Alternative Method */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Alternative: Direct Package Installation</h2>
        <div className="p-4 bg-card dark:bg-muted rounded-lg">
          <p className="text-muted-foreground mb-4">
            If you prefer to install the package globally, you can use npm:
          </p>
          <TerminalDisplay 
            command="npm install -g @pluggedin/pluggedin-mcp-proxy"
            className="mb-4"
          />
          <p className="text-muted-foreground">
            Then configure Cursor to use the installed package with your API key as an environment variable.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What You Can Do</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">🔧 Tool Integration</h4>
            <p className="text-muted-foreground text-sm">
              Access all your configured MCP tools directly within Cursor for seamless workflow integration.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">📋 Resource Management</h4>
            <p className="text-muted-foreground text-sm">
              Manage and access MCP resources like documents, data sources, and external APIs from the editor.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">🤖 AI Enhancement</h4>
            <p className="text-muted-foreground text-sm">
              Enhance Cursor&apos;s AI capabilities with additional context and tools from your MCP servers.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">🔒 Secure Access</h4>
            <p className="text-muted-foreground text-sm">
              All communications are secured through the Plugged.in proxy with proper authentication.
            </p>
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Troubleshooting</h2>
        <div className="space-y-4">
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">MCP server not connecting</h4>
            <p className="text-muted-foreground">
              Verify that your API key is correct and that you have an active internet connection. 
              Check the Cursor console for any error messages.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">NPX command fails</h4>
            <p className="text-muted-foreground">
              Make sure Node.js and npm are properly installed. You can verify by running:
            </p>
            <TerminalDisplay 
              command="node --version && npm --version"
              className="mt-2"
            />
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Package download issues</h4>
            <p className="text-muted-foreground">
              If the package fails to download, try clearing npm cache:
            </p>
            <TerminalDisplay 
              command="npm cache clean --force"
              className="mt-2"
            />
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
              Learn how to maximize productivity with Cursor and MCP integration
            </p>
          </Link>
          <Link href="/search" className="p-4 bg-card dark:bg-muted rounded-lg hover:shadow-md transition-shadow">
            <h4 className="font-semibold mb-2">Discover MCP Servers</h4>
            <p className="text-muted-foreground text-sm">
              Browse additional MCP servers to enhance your Cursor workflow
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}