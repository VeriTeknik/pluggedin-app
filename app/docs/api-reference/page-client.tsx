'use client';

import { Copy, ExternalLink, Globe, Lock, Zap } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CodeBlockProps {
  children: string;
  language?: string;
}

function CodeBlock({ children, language = 'bash' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
        <code className={`language-${language}`}>{children}</code>
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-8 w-8 p-0"
        onClick={handleCopy}
      >
        {copied ? (
          <span className="text-xs">✓</span>
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

interface EndpointCardProps {
  method: string;
  endpoint: string;
  description: string;
  children: React.ReactNode;
}

function EndpointCard({ method, endpoint, description, children }: EndpointCardProps) {
  const methodColors = {
    GET: 'bg-green-100 text-green-800 border-green-300',
    POST: 'bg-blue-100 text-blue-800 border-blue-300',
    PUT: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    DELETE: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Badge 
            variant="outline" 
            className={`${methodColors[method as keyof typeof methodColors]} font-mono`}
          >
            {method}
          </Badge>
          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
            {endpoint}
          </code>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}

export default function ApiReferencePageClient() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">MCP Registry API Documentation</h1>
        <p className="text-lg text-muted-foreground mb-4">
          The MCP Registry API provides a centralized service for discovering and managing 
          Model Context Protocol (MCP) servers. This API is available at{' '}
          <code className="bg-muted px-2 py-1 rounded">https://registry.plugged.in</code> 
          and offers enhanced features including filtering, sorting, and search capabilities.
        </p>
        
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant="outline" className="flex items-center gap-2">
            <Globe className="h-3 w-3" />
            RESTful API
          </Badge>
          <Badge variant="outline" className="flex items-center gap-2">
            <Lock className="h-3 w-3" />
            GitHub Auth
          </Badge>
          <Badge variant="outline" className="flex items-center gap-2">
            <Zap className="h-3 w-3" />
            Real-time Updates
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="endpoints" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="examples">Examples</TabsTrigger>
          <TabsTrigger value="models">Data Models</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="space-y-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Base URL</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock language="text">https://registry.plugged.in</CodeBlock>
              </CardContent>
            </Card>

            <EndpointCard
              method="GET"
              endpoint="/v0/health"
              description="Check the health status of the registry service"
            >
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Response:</h4>
                  <CodeBlock language="json">
{`{
  "status": "ok",
  "github_client_configured": true
}`}
                  </CodeBlock>
                </div>
              </div>
            </EndpointCard>

            <EndpointCard
              method="GET"
              endpoint="/v0/servers"
              description="Retrieve a paginated list of MCP servers with optional filtering, sorting, and search"
            >
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Query Parameters:</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-muted">
                          <th className="border border-gray-300 p-2 text-left">Parameter</th>
                          <th className="border border-gray-300 p-2 text-left">Type</th>
                          <th className="border border-gray-300 p-2 text-left">Description</th>
                          <th className="border border-gray-300 p-2 text-left">Default</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-gray-300 p-2"><code>limit</code></td>
                          <td className="border border-gray-300 p-2">integer</td>
                          <td className="border border-gray-300 p-2">Number of results per page (max: 500)</td>
                          <td className="border border-gray-300 p-2">50</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-300 p-2"><code>offset</code></td>
                          <td className="border border-gray-300 p-2">integer</td>
                          <td className="border border-gray-300 p-2">Number of results to skip</td>
                          <td className="border border-gray-300 p-2">0</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-300 p-2"><code>registry_name</code></td>
                          <td className="border border-gray-300 p-2">string</td>
                          <td className="border border-gray-300 p-2">Filter by package registry (npm, pip, docker, etc.)</td>
                          <td className="border border-gray-300 p-2">-</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-300 p-2"><code>sort</code></td>
                          <td className="border border-gray-300 p-2">string</td>
                          <td className="border border-gray-300 p-2">Sort order (see options below)</td>
                          <td className="border border-gray-300 p-2">newest</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-300 p-2"><code>search</code></td>
                          <td className="border border-gray-300 p-2">string</td>
                          <td className="border border-gray-300 p-2">Search in name and description</td>
                          <td className="border border-gray-300 p-2">-</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Sort Options:</h4>
                  <ul className="space-y-1 text-sm">
                    <li><code>newest</code> or <code>release_date_desc</code> - Latest releases first (default)</li>
                    <li><code>release_date_asc</code> - Oldest releases first</li>
                    <li><code>alphabetical</code> or <code>name_asc</code> - Alphabetical by name (A-Z)</li>
                    <li><code>name_desc</code> - Reverse alphabetical (Z-A)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Example Request:</h4>
                  <CodeBlock>
                    {`curl "https://registry.plugged.in/v0/servers?registry_name=npm&sort=newest&limit=10"`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Response:</h4>
                  <CodeBlock language="json">
{`{
  "servers": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "io.github.username/mcp-server-example",
      "description": "An example MCP server",
      "repository": {
        "url": "https://github.com/username/mcp-server-example",
        "source": "github",
        "id": "123456789"
      },
      "version_detail": {
        "version": "1.2.3",
        "release_date": "2025-01-11T12:00:00Z",
        "is_latest": true
      },
      "packages": [
        {
          "registry_name": "npm",
          "name": "@username/mcp-server-example",
          "version": "1.2.3"
        }
      ]
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 125
  }
}`}
                  </CodeBlock>
                </div>
              </div>
            </EndpointCard>

            <EndpointCard
              method="GET"
              endpoint="/v0/servers/{id}"
              description="Retrieve detailed information about a specific MCP server"
            >
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Path Parameters:</h4>
                  <ul className="space-y-1 text-sm">
                    <li><code>id</code> - The UUID of the server</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Example Request:</h4>
                  <CodeBlock>
                    {`curl "https://registry.plugged.in/v0/servers/550e8400-e29b-41d4-a716-446655440000"`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Response:</h4>
                  <CodeBlock language="json">
{`{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "io.github.username/mcp-server-example",
  "description": "An example MCP server with extended features",
  "repository": {
    "url": "https://github.com/username/mcp-server-example",
    "source": "github",
    "id": "123456789"
  },
  "version_detail": {
    "version": "1.2.3",
    "release_date": "2025-01-11T12:00:00Z",
    "is_latest": true
  },
  "packages": [
    {
      "registry_name": "npm",
      "name": "@username/mcp-server-example",
      "version": "1.2.3"
    }
  ],
  "capabilities": {
    "tools": ["calculate", "search", "translate"],
    "prompts": ["math_helper", "code_assistant"],
    "resources": ["file_access", "web_fetch"]
  },
  "transports": ["stdio", "http"],
  "license": "MIT",
  "author": {
    "name": "John Doe",
    "email": "john@example.com"
  }
}`}
                  </CodeBlock>
                </div>
              </div>
            </EndpointCard>

            <EndpointCard
              method="POST"
              endpoint="/v0/publish"
              description="Publish a new MCP server or update an existing one. Requires GitHub authentication."
            >
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Headers:</h4>
                  <ul className="space-y-1 text-sm">
                    <li><code>Authorization: Bearer YOUR_GITHUB_TOKEN</code></li>
                    <li><code>Content-Type: application/json</code></li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Request Body:</h4>
                  <CodeBlock language="json">
{`{
  "url": "https://github.com/username/mcp-server-name"
}`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Requirements:</h4>
                  <ul className="space-y-1 text-sm">
                    <li>Valid GitHub personal access token</li>
                    <li>Token owner must have admin access to the repository</li>
                    <li>Repository must contain a valid MCP server configuration</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Example Request:</h4>
                  <CodeBlock>
{`curl -X POST "https://registry.plugged.in/v0/publish" \\
  -H "Authorization: Bearer ghp_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://github.com/username/mcp-server-example"}'`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Success Response:</h4>
                  <CodeBlock language="json">
{`{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Server published successfully"
}`}
                  </CodeBlock>
                </div>
              </div>
            </EndpointCard>

            <EndpointCard
              method="POST"
              endpoint="/v0/cache/refresh"
              description="Manually refresh the proxy cache (useful after publishing)"
            >
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Example Request:</h4>
                  <CodeBlock>
                    {`curl -X POST "https://registry.plugged.in/v0/cache/refresh"`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Response:</h4>
                  <CodeBlock language="json">
{`{
  "message": "Cache refreshed successfully",
  "updated_at": "2025-01-11T12:00:00Z"
}`}
                  </CodeBlock>
                </div>
              </div>
            </EndpointCard>
          </div>
        </TabsContent>

        <TabsContent value="authentication" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
              <CardDescription>
                Most endpoints are publicly accessible. Only the publish endpoint requires authentication.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Public Endpoints:</h4>
                <ul className="space-y-1 text-sm">
                  <li><code>GET /v0/health</code> - Health check</li>
                  <li><code>GET /v0/servers</code> - List servers</li>
                  <li><code>GET /v0/servers/{'{id}'}</code> - Get server details</li>
                  <li><code>POST /v0/cache/refresh</code> - Refresh cache</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Authenticated Endpoints:</h4>
                <ul className="space-y-1 text-sm">
                  <li><code>POST /v0/publish</code> - Publish server (requires GitHub token)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">GitHub Token Setup:</h4>
                <ol className="space-y-2 text-sm">
                  <li>1. Go to GitHub Settings → Developer settings → Personal access tokens</li>
                  <li>2. Create a new token with <code>repo</code> permissions</li>
                  <li>3. Use the token in the Authorization header: <code>Bearer YOUR_TOKEN</code></li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="examples" className="space-y-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Example Use Cases</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">1. Search for Python MCP Servers</h4>
                  <CodeBlock>
                    {`curl "https://registry.plugged.in/v0/servers?registry_name=pip&search=llm"`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">2. Get Latest NPM Servers</h4>
                  <CodeBlock>
                    {`curl "https://registry.plugged.in/v0/servers?registry_name=npm&sort=newest&limit=20"`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">3. Paginate Through All Servers</h4>
                  <CodeBlock>
{`# First page
curl "https://registry.plugged.in/v0/servers?limit=50&offset=0"

# Second page
curl "https://registry.plugged.in/v0/servers?limit=50&offset=50"`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">4. Search and Sort</h4>
                  <CodeBlock>
                    {`curl "https://registry.plugged.in/v0/servers?search=assistant&sort=alphabetical"`}
                  </CodeBlock>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SDK Examples</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">JavaScript/TypeScript</h4>
                  <CodeBlock language="javascript">
{`// List servers
const response = await fetch('https://registry.plugged.in/v0/servers?registry_name=npm');
const data = await response.json();

// Publish server
const publishResponse = await fetch('https://registry.plugged.in/v0/publish', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${githubToken}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://github.com/username/mcp-server'
  })
});`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Python</h4>
                  <CodeBlock language="python">
{String.raw`import requests

# List servers
response = requests.get('https://registry.plugged.in/v0/servers', 
                       params={'registry_name': 'pip'})
servers = response.json()

# Publish server
headers = {
    'Authorization': f'Bearer {github_token}',
    'Content-Type': 'application/json'
}
payload = {'url': 'https://github.com/username/mcp-server'}
response = requests.post('https://registry.plugged.in/v0/publish', 
                        headers=headers, json=payload)`}
                  </CodeBlock>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="models" className="space-y-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Data Models</CardTitle>
                <CardDescription>
                  TypeScript interfaces for all API response objects
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">Server Object</h4>
                  <CodeBlock language="typescript">
{`interface Server {
  id: string;                    // UUID
  name: string;                  // Format: "io.github.{owner}/{repo}"
  description: string;           // Short description
  repository: Repository;        // Repository details
  version_detail: VersionDetail; // Version information
  packages: Package[];           // Available packages
}`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Repository Object</h4>
                  <CodeBlock language="typescript">
{`interface Repository {
  url: string;    // Full GitHub URL
  source: string; // "github"
  id: string;     // GitHub repository ID
}`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Version Detail Object</h4>
                  <CodeBlock language="typescript">
{`interface VersionDetail {
  version: string;       // Semantic version (e.g., "1.2.3")
  release_date: string;  // ISO 8601 timestamp
  is_latest: boolean;    // Whether this is the latest version
}`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Package Object</h4>
                  <CodeBlock language="typescript">
{`interface Package {
  registry_name: string; // "npm", "pip", "docker", etc.
  name: string;          // Package name in the registry
  version: string;       // Package version
}`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Pagination Object</h4>
                  <CodeBlock language="typescript">
{`interface Pagination {
  limit: number;  // Results per page
  offset: number; // Number of skipped results
  total: number;  // Total number of results
}`}
                  </CodeBlock>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Error Handling</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Error Response Format</h4>
                  <CodeBlock language="json">
{`{
  "error": "Error description",
  "code": "ERROR_CODE",
  "details": {
    // Additional error context
  }
}`}
                  </CodeBlock>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Common HTTP Status Codes</h4>
                  <ul className="space-y-1 text-sm">
                    <li><code>200</code> - Success</li>
                    <li><code>400</code> - Bad Request (invalid parameters)</li>
                    <li><code>401</code> - Unauthorized (missing/invalid auth)</li>
                    <li><code>403</code> - Forbidden (insufficient permissions)</li>
                    <li><code>404</code> - Not Found</li>
                    <li><code>500</code> - Internal Server Error</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rate Limiting & CORS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Rate Limiting</h4>
                  <p className="text-sm text-muted-foreground">
                    Currently, there are no rate limits on the API. However, please be respectful of the service:
                  </p>
                  <ul className="space-y-1 text-sm">
                    <li>Cache responses when possible</li>
                    <li>Use appropriate pagination limits</li>
                    <li>Avoid making excessive requests</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">CORS Configuration</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    The API supports CORS for the following origins:
                  </p>
                  <ul className="space-y-1 text-sm">
                    <li><code>https://plugged.in</code></li>
                    <li><code>https://staging.plugged.in</code></li>
                    <li><code>http://localhost:12005</code></li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-12 p-6 bg-muted rounded-lg">
        <h3 className="font-semibold mb-4">Support & Contributing</h3>
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            GitHub Issues: <a href="https://github.com/VeriTeknik/registry-proxy/issues" className="text-primary hover:underline">registry-proxy/issues</a>
          </p>
          <p className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Email: support@plugged.in
          </p>
          <p className="text-muted-foreground mt-4">
            Last Updated: January 2025
          </p>
        </div>
      </div>
    </div>
  );
} 