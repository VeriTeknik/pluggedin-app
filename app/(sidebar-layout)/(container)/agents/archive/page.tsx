'use client';

import { ArrowLeft, Server } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  type Agent,
  fetcher,
  formatDate,
  getStateBadgeVariant,
  isArchivedState,
} from '@/lib/pap-ui-utils';

export default function AgentsArchivePage() {
  const { data: agents, error, isLoading } = useSWR<Agent[]>('/api/agents', fetcher);

  // Filter to show only terminated and killed agents
  const archivedAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(agent => isArchivedState(agent.state));
  }, [agents]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading archived agents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-500">Failed to load agents</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/agents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Agents
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Archived Agents</h1>
        <p className="text-muted-foreground mt-1">
          Terminated agents are kept for audit trail and history
        </p>
      </div>

      {archivedAgents.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Archived Agents</CardTitle>
            <CardDescription>
              Terminated agents will appear here for historical reference.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {archivedAgents.map((agent) => (
            <Card key={agent.uuid} className="opacity-75 hover:opacity-100 transition-opacity">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-gray-400" />
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                  </div>
                  <Badge variant={getStateBadgeVariant(agent.state)}>
                    {agent.state}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">
                  {agent.dns_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span>{formatDate(agent.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Terminated:</span>
                    <span>{formatDate(agent.terminated_at)}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    asChild
                  >
                    <Link href={`/agents/${agent.uuid}`}>
                      View History
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
