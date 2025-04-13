import { ChevronLeft, Shield } from 'lucide-react';
import { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'MCP Server Sharing Security | Plugged.in',
  description: 'Learn about how Plugged.in secures your MCP server configurations when sharing'
};

export default function SharingMcpServersPage() {
  return (
    <div className="container py-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
        </Button>
      </div>
      
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Sharing MCP Servers in Plugged.in</h1>
      </div>
      
      <p className="text-muted-foreground mb-8">
        This document explains how MCP server sharing works in Plugged.in, focusing on security practices and how sensitive information is handled.
      </p>
      
      <div className="prose dark:prose-invert max-w-none">
        <h2>Security Overview</h2>
        <p>
          When you share an MCP server in Plugged.in, we prioritize security by ensuring that sensitive information like credentials, API keys, and private URLs are never exposed to other users.
        </p>
        
        <h3>What Information is Shared?</h3>
        <p>When you share a server, the following information is shared:</p>
        <ul>
          <li>Server title and description (as you enter them when sharing)</li>
          <li>Server type (STDIO or SSE)</li>
          <li>Basic command and arguments structure</li>
          <li>URL structure (with credentials removed)</li>
        </ul>
        
        <h3>What Information is NOT Shared?</h3>
        <p>We explicitly protect the following sensitive information:</p>
        <ul>
          <li>Passwords and API keys in database URLs</li>
          <li>Environment variables containing secrets</li>
          <li>Authentication tokens</li>
          <li>Private API keys</li>
          <li>Any other credentials</li>
        </ul>
        
        <h2>How Sanitization Works</h2>
        <p>When you share an MCP server, Plugged.in automatically performs these security measures:</p>
        <ol>
          <li><strong>Template Creation:</strong> We create a sanitized template of your server configuration</li>
          <li><strong>Credential Removal:</strong> Any passwords in connection strings are replaced with placeholders</li>
          <li><strong>Environment Variable Protection:</strong> Sensitive environment variables are replaced with descriptive placeholders</li>
          <li><strong>API Key Protection:</strong> API keys in URLs or parameters are removed</li>
        </ol>
        
        <h3>Example of Sanitization</h3>
        <p>Original connection string:</p>
        <pre><code>postgresql://postgres:MySecretPassword123!@database.example.com:5432/my_database</code></pre>
        
        <p>Sanitized version shared with others:</p>
        <pre><code>postgresql://postgres:&lt;YOUR_PASSWORD&gt;@database.example.com:5432/my_database</code></pre>
        
        <h2>When Importing Shared Servers</h2>
        <p>When someone imports a server you&apos;ve shared:</p>
        <ol>
          <li>They receive the sanitized template with placeholders</li>
          <li>They must provide their own credentials to make the server work</li>
          <li>The template serves as a guide for proper configuration</li>
          <li>A note indicates that the server was imported from a shared template</li>
        </ol>
        
        <h2>Best Practices</h2>
        <p>Even with these protections in place, its good practice to:</p>
        <ol>
          <li>Review what you&apos;re sharing before sharing it</li>
          <li>Use descriptive titles and descriptions to help others understand the purpose of the server</li>
          <li>Consider adding setup instructions in the description if there are specific requirements</li>
        </ol>
        
        <h2>Questions or Concerns</h2>
        <p>
          If you have any questions or concerns about server sharing security, please contact us at 
          <a href="mailto:support@plugged.in" className="pl-1">support@plugged.in</a>.
        </p>
      </div>
    </div>
  );
} 