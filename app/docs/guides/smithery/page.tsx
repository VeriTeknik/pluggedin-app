'use client';

import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { getFirstApiKey } from '@/app/actions/api-keys';
import { ApiKeyDisplay } from '@/components/docs/api-key-display';
import { ConfigDisplay } from '@/components/docs/config-display';
import { TerminalDisplay } from '@/components/docs/terminal-display';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';

export default function SmitheryGuidePage() {
  const { isAuthenticated } = useAuth();
  const { currentProject } = useProjects();
  const { data: apiKey } = useSWR(
    isAuthenticated && currentProject?.uuid ? `${currentProject?.uuid}/api-keys/getFirst` : null,
    () => getFirstApiKey(currentProject?.uuid || '')
  );
  const { t } = useTranslation();

  const apiKeyValue = isAuthenticated && apiKey?.api_key ? apiKey.api_key : '<YOUR_PLUGGEDIN_API_KEY>';

  const smitheryConfig = {
    mcpServers: {
      PluggedinMCP: {
        command: "smithery",
        args: [
          "run",
          "@VeriTeknik/pluggedin-mcp",
          "--config",
          `{"pluggedinApiKey":"${apiKeyValue}"}`
        ]
      }
    }
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
        <h1 className="text-4xl font-bold mb-4">Smithery Setup</h1>
        <p className="text-lg text-muted-foreground">
          Deploy Plugged.in MCP using Smithery cloud platform for maximum compatibility and ease of use.
        </p>
      </div>

      {/* What is Smithery */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">About Smithery</h2>
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 rounded-lg">
          <p className="text-muted-foreground mb-4">
            Smithery is a cloud platform that makes it easy to run MCP servers in Docker containers. 
            This approach provides maximum compatibility across different operating systems and environments.
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>No local installation required</li>
            <li>Consistent performance across all platforms</li>
            <li>Automatic scaling and reliability</li>
            <li>Easy configuration management</li>
          </ul>
        </div>
      </section>

      {/* Prerequisites */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Prerequisites</h2>
        <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 rounded-lg">
          <ul className="list-disc list-inside space-y-2">
            <li>Smithery CLI installed (Windows recommended)</li>
            <li>Active internet connection</li>
            <li>Plugged.in account with API key</li>
          </ul>
        </div>
      </section>

      {/* Smithery CLI Installation */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Install Smithery CLI</h2>
        <p className="text-muted-foreground mb-4">
          First, you need to install the Smithery CLI. Visit the official documentation for installation instructions:
        </p>
        <div className="p-4 bg-card dark:bg-muted rounded-lg mb-4">
          <Link 
            href="https://smithery.ai/docs/smithery-cli"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            Smithery CLI Documentation
            <ExternalLink className="ml-1 h-4 w-4" />
          </Link>
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

      {/* Method 1: Direct Command */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Method 1: Direct Terminal Command</h2>
        <p className="text-muted-foreground mb-4">
          Run the Plugged.in MCP server directly from your terminal using Smithery:
        </p>
        <TerminalDisplay 
          command={`smithery run @VeriTeknik/pluggedin-mcp --config '{"pluggedinApiKey":"${apiKeyValue}"}'`}
          className="mb-4"
        />
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 rounded-lg">
          <p className="text-sm">
            <strong>Note:</strong> This command will download and run the Plugged.in MCP server in a Docker container
            managed by Smithery with your API key configuration.
          </p>
        </div>
      </section>

      {/* Method 2: Claude Desktop Integration */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Method 2: Claude Desktop Configuration</h2>
        <p className="text-muted-foreground mb-4">
          For integration with Claude Desktop, add the following configuration to your claude_desktop_config.json file:
        </p>
        <ConfigDisplay 
          config={smitheryConfig}
          copyMessage="Smithery configuration copied to clipboard"
          className="mb-4"
        />
        <div className="p-4 bg-muted rounded-lg mb-4">
          <p className="text-sm font-semibold mb-2">Configuration file locations:</p>
          <div className="font-mono text-sm space-y-1">
            <div><strong>macOS:</strong> ~/Library/Application Support/Claude/claude_desktop_config.json</div>
            <div><strong>Windows:</strong> %APPDATA%\Claude\claude_desktop_config.json</div>
          </div>
        </div>
      </section>

      {/* Smithery Server Page */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Smithery Server Listing</h2>
        <p className="text-muted-foreground mb-4">
          You can also visit the Plugged.in MCP server listing directly on Smithery for more information and alternative installation methods:
        </p>
        <div className="p-4 bg-card dark:bg-muted rounded-lg">
          <Link 
            href="https://smithery.ai/server/@VeriTeknik/pluggedin-mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            View on Smithery
            <ExternalLink className="ml-1 h-4 w-4" />
          </Link>
          <p className="text-muted-foreground text-sm mt-2">
            The server page includes additional documentation, version history, and community feedback.
          </p>
        </div>
      </section>

      {/* Advantages */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Why Choose Smithery?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">🐳 Docker Containers</h4>
            <p className="text-muted-foreground text-sm">
              Runs in isolated Docker containers for maximum compatibility and security.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">☁️ Cloud Hosted</h4>
            <p className="text-muted-foreground text-sm">
              No local installation required - everything runs in the cloud.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">🔧 Easy Configuration</h4>
            <p className="text-muted-foreground text-sm">
              Simple JSON configuration with built-in environment management.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">🚀 Auto Scaling</h4>
            <p className="text-muted-foreground text-sm">
              Automatic scaling and high availability for production workloads.
            </p>
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Troubleshooting</h2>
        <div className="space-y-4">
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Smithery CLI not found</h4>
            <p className="text-muted-foreground">
              Make sure you&apos;ve installed the Smithery CLI following the official installation guide. 
              Restart your terminal after installation.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Configuration not loading</h4>
            <p className="text-muted-foreground">
              Verify that your JSON configuration is valid and that your API key is correctly formatted. 
              Check for any trailing commas or syntax errors.
            </p>
          </div>
          <div className="p-4 bg-card dark:bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Server connection issues</h4>
            <p className="text-muted-foreground">
              Ensure you have a stable internet connection and that your API key is valid. 
              Check the Smithery logs for detailed error information.
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
              Learn advanced techniques for cloud-based MCP deployment
            </p>
          </Link>
          <Link href="/search" className="p-4 bg-card dark:bg-muted rounded-lg hover:shadow-md transition-shadow">
            <h4 className="font-semibold mb-2">Discover More Servers</h4>
            <p className="text-muted-foreground text-sm">
              Find additional MCP servers to enhance your cloud workflow
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}