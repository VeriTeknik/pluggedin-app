'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { Search, Package, Shield, ExternalLink, Plus } from 'lucide-react';

import { getMyClaimedServers, getUnclaimedServers, claimServer, unclaimServer } from '@/app/actions/registry';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

interface RegistryServer {
  id: string;
  name: string;
  description: string;
  source: string;
  repository?: string;
  metadata: {
    verified: boolean;
    github_stars?: number;
    category?: string;
    tags?: string[];
    install_count?: number;
    rating?: number;
  };
  claimed_at?: string;
  created_at: string;
  updated_at?: string;
}

export default function RegistryPage() {
  const { t } = useTranslation(['registry', 'common']);
  const { toast } = useToast();
  const { session } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [claimNotes, setClaimNotes] = useState('');
  const [selectedServer, setSelectedServer] = useState<RegistryServer | null>(null);
  const [isClaimDialogOpen, setIsClaimDialogOpen] = useState(false);

  // Check authentication
  if (!session?.user) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertDescription>
            Please log in to manage your registry servers.
            <Button className="ml-4" onClick={() => router.push('/login')}>
              Log In
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Fetch my claimed servers
  const { data: myServersData, isLoading: isLoadingMy, mutate: mutateMy } = useSWR(
    'my-registry-servers',
    async () => {
      const result = await getMyClaimedServers();
      if (!result.success) throw new Error(result.error);
      return result.data;
    }
  );

  // Fetch unclaimed servers
  const { data: unclaimedData, isLoading: isLoadingUnclaimed, mutate: mutateUnclaimed } = useSWR(
    'unclaimed-registry-servers',
    async () => {
      const result = await getUnclaimedServers();
      if (!result.success) throw new Error(result.error);
      return result.data;
    }
  );

  const handleClaimServer = async () => {
    if (!selectedServer) return;

    try {
      const result = await claimServer(selectedServer.id, { notes: claimNotes });
      if (result.success) {
        toast({
          title: 'Success',
          description: `Successfully claimed ${selectedServer.name}`,
        });
        setIsClaimDialogOpen(false);
        setClaimNotes('');
        setSelectedServer(null);
        // Refresh both lists
        mutateMy();
        mutateUnclaimed();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to claim server',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleUnclaimServer = async (server: RegistryServer) => {
    try {
      const result = await unclaimServer(server.id);
      if (result.success) {
        toast({
          title: 'Success',
          description: `Successfully unclaimed ${server.name}`,
        });
        // Refresh both lists
        mutateMy();
        mutateUnclaimed();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to unclaim server',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  const filteredMyServers = myServersData?.servers.filter(server =>
    server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    server.description.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredUnclaimedServers = unclaimedData?.servers.filter(server =>
    server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    server.description.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Registry Management</h1>
        <p className="text-muted-foreground">
          Manage your MCP servers in the official registry
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search servers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={() => router.push('/social/import')}>
          <Plus className="h-4 w-4 mr-2" />
          Import GitHub Repository
        </Button>
      </div>

      <Tabs defaultValue="my-servers" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="my-servers">
            My Servers ({filteredMyServers.length})
          </TabsTrigger>
          <TabsTrigger value="unclaimed">
            Unclaimed ({filteredUnclaimedServers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-servers" className="space-y-4">
          {isLoadingMy ? (
            <div className="grid gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : filteredMyServers.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  You haven't claimed any servers yet. Check the unclaimed tab to find your servers.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredMyServers.map((server) => (
                <Card key={server.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <Package className="h-5 w-5" />
                          {server.name}
                          {server.metadata.verified && (
                            <Shield className="h-4 w-4 text-green-500" />
                          )}
                        </CardTitle>
                        <CardDescription>{server.description}</CardDescription>
                      </div>
                      <Badge variant="outline">{server.source}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {server.metadata.github_stars !== undefined && (
                        <span>⭐ {server.metadata.github_stars} stars</span>
                      )}
                      {server.metadata.install_count !== undefined && (
                        <span>📦 {server.metadata.install_count} installs</span>
                      )}
                      {server.metadata.rating !== undefined && (
                        <span>⭐ {server.metadata.rating}/5 rating</span>
                      )}
                    </div>
                    {server.repository && (
                      <a
                        href={server.repository}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                      >
                        View Repository
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Claimed on {new Date(server.claimed_at!).toLocaleDateString()}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnclaimServer(server)}
                      >
                        Unclaim
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="unclaimed" className="space-y-4">
          {isLoadingUnclaimed ? (
            <div className="grid gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : filteredUnclaimedServers.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  No unclaimed servers found. All servers have been claimed by their owners.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredUnclaimedServers.map((server) => (
                <Card key={server.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <Package className="h-5 w-5" />
                          {server.name}
                        </CardTitle>
                        <CardDescription>{server.description}</CardDescription>
                      </div>
                      <Badge variant="outline">{server.source}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {server.metadata.github_stars !== undefined && (
                        <span>⭐ {server.metadata.github_stars} stars</span>
                      )}
                      {server.metadata.category && (
                        <Badge variant="secondary">{server.metadata.category}</Badge>
                      )}
                    </div>
                    {server.repository && (
                      <a
                        href={server.repository}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                      >
                        View Repository
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Added on {new Date(server.created_at).toLocaleDateString()}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedServer(server);
                          setIsClaimDialogOpen(true);
                        }}
                      >
                        Claim This Server
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isClaimDialogOpen} onOpenChange={setIsClaimDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim {selectedServer?.name}</DialogTitle>
            <DialogDescription>
              By claiming this server, you confirm that you are the owner or maintainer of this MCP server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Add any notes about your ownership or role..."
                value={claimNotes}
                onChange={(e) => setClaimNotes(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClaimDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClaimServer}>
              Claim Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}