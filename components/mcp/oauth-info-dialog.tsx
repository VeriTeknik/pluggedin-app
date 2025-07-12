'use client';

import { Info, ExternalLink, Terminal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface OAuthInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverName: string;
  serverUrl?: string;
}

export function OAuthInfoDialog({ 
  open, 
  onOpenChange, 
  serverName,
  serverUrl 
}: OAuthInfoDialogProps) {
  
  // Provide specific instructions for known servers
  const getServerInstructions = () => {
    const name = serverName.toLowerCase();
    
    if (name.includes('linear')) {
      return {
        title: 'Linear OAuth Setup',
        steps: [
          'Linear MCP uses OAuth for authentication.',
          'The server will automatically prompt for authentication when you first use it.',
          'Make sure you have the Linear MCP server running locally.',
          'When you try to use Linear tools in your AI assistant, it will open the OAuth flow.',
          'The OAuth callback will be handled at http://localhost:14881/oauth/callback'
        ],
        docs: 'https://modelcontextprotocol.io/servers/linear'
      };
    }
    
    return {
      title: 'OAuth Authentication Required',
      steps: [
        'This server requires OAuth authentication.',
        'Check the server documentation for specific setup instructions.',
        'Most MCP servers handle OAuth automatically when you first use them.',
        'The server will guide you through the authentication process.'
      ]
    };
  };
  
  const instructions = getServerInstructions();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{instructions.title}</DialogTitle>
          <DialogDescription>
            Authentication instructions for {serverName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">How MCP OAuth Works:</p>
                <ul className="list-disc ml-5 space-y-1 text-sm">
                  <li>MCP servers handle their own OAuth flows</li>
                  <li>Authentication happens when you first use the server</li>
                  <li>The server will open a browser window for authorization</li>
                  <li>Tokens are stored securely by the MCP server</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
          
          <div className="space-y-2">
            <h3 className="font-semibold">Setup Instructions:</h3>
            <ol className="list-decimal ml-5 space-y-1 text-sm">
              {instructions.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
          
          {serverUrl && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Server URL:</span> {serverUrl}
            </div>
          )}
          
          {instructions.docs && (
            <div className="pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(instructions.docs, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Documentation
              </Button>
            </div>
          )}
          
          <Alert className="bg-muted">
            <Terminal className="h-4 w-4" />
            <AlertDescription>
              <p className="font-mono text-xs">
                # To test if OAuth is working, try using the server:
                <br />
                # The OAuth flow will start automatically when needed
              </p>
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}