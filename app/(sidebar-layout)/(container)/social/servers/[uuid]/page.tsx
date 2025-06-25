import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getSharedMcpServer } from '@/app/actions/social';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shared Server',
  description: 'View details of a shared MCP server',
};

type PageProps = {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const { uuid } = await params;
  const _searchParamsResolved = await searchParams;
  const sharedServer = await getSharedMcpServer(uuid);

  if (!sharedServer || !sharedServer.server) {
    notFound();
  }

  const server = sharedServer.server;
  
  return (
    <div className="container py-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{sharedServer.title}</CardTitle>
              <CardDescription>{sharedServer.description || 'No description provided'}</CardDescription>
              
              {/* Show who shared the server */}
              <div className="flex items-center space-x-2 mt-2 text-sm text-muted-foreground">
                <span>Shared by:</span>
                <Link 
                  href={`/social/profile/${sharedServer.profile_uuid}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {sharedServer.profile_username || 'Unknown'}
                </Link>
                {server.originalServerUuid && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Original ID: {server.originalServerUuid}
                  </span>
                )}
                {server.sharedBy && (
                  <span className="text-xs text-muted-foreground ml-2">
                    by {server.sharedBy}
                  </span>
                )}
              </div>
            </div>
            <Badge variant="outline" className="text-sm">
              {server.type || 'Unknown Type'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          
          {server.command && (
            <div>
              <h3 className="text-sm font-medium mb-1">Command</h3>
              <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md font-mono text-sm">
                {server.command}
              </div>
            </div>
          )}
          
          {server.args && server.args.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-1">Arguments</h3>
              <div className="space-y-2">
                {server.args.map((arg, index) => (
                  <div key={index} className="bg-slate-100 dark:bg-slate-800 p-2 rounded-md font-mono text-sm">
                    {arg}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {server.env && Object.keys(server.env).length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-1">Environment Variables</h3>
              <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md">
                <div className="grid grid-cols-[1fr,2fr] gap-2">
                  {Object.entries(server.env).map(([key, value]) => (
                    <div key={key} className="contents">
                      <div className="font-mono text-sm font-medium p-1">{key}</div>
                      <div className="font-mono text-sm p-1">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {server.url && (
            <div>
              <h3 className="text-sm font-medium mb-1">URL</h3>
              <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md font-mono text-sm">
                {server.url}
              </div>
            </div>
          )}
          
          {server.customInstructions && (
            <div>
              <h3 className="text-sm font-medium mb-1">Custom Instructions</h3>
              <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md">
                {Array.isArray(server.customInstructions) ? (
                  <div className="space-y-3">
                    {server.customInstructions.map((instruction, idx) => (
                      <div key={idx} className="text-sm">
                        {typeof instruction === 'string' ? (
                          <pre className="whitespace-pre-wrap font-mono text-xs">{instruction}</pre>
                        ) : (
                          <div>
                            <div className="font-medium">{instruction.role || 'unknown'}:</div>
                            <pre className="whitespace-pre-wrap font-mono text-xs ml-4 mt-1">
                              {typeof instruction.content === 'string'
                                ? instruction.content
                                : JSON.stringify(instruction.content, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {JSON.stringify(server.customInstructions, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <div className="flex justify-between w-full">
            <Button variant="outline" asChild>
              <Link href="/social/servers">Back to Servers</Link>
            </Button>
            
            <form action={async () => {
              'use server';
              // Server action to import the shared server
              // Could be implemented in a separate file
            }}>
              <Button>Import Server</Button>
            </form>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
} 