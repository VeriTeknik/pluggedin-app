'use client';

import { useEffect, useState } from 'react';
import { Shield, ShieldOff, RefreshCw, ExternalLink, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { getMcpServerOAuthStatus, clearMcpServerOAuth, triggerMcpServerOAuth, type OAuthStatus } from '@/app/actions/mcp-oauth';
import { OAuthInfoDialog } from './oauth-info-dialog';

interface OAuthStatusProps {
  serverUuid: string;
  serverName: string;
  serverType: string;
}

export function McpOAuthStatus({ serverUuid, serverName, serverType }: OAuthStatusProps) {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const { toast } = useToast();

  const fetchStatus = async () => {
    setRefreshing(true);
    try {
      const result = await getMcpServerOAuthStatus(serverUuid);
      if (result.success && result.data) {
        setStatus(result.data);
      } else {
        // On error, assume not authenticated
        setStatus({
          isAuthenticated: false,
          hasActiveSession: false
        });
      }
    } catch (error) {
      console.error('Failed to fetch OAuth status:', error);
      // On error, assume not authenticated
      setStatus({
        isAuthenticated: false,
        hasActiveSession: false
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [serverUuid]);

  const handleAuthenticate = async () => {
    setLoading(true);
    try {
      const result = await triggerMcpServerOAuth(serverUuid);
      
      // Check if we have an OAuth URL to open (regardless of success status)
      if (result.authUrl) {
        window.open(result.authUrl, '_blank');
        toast({
          title: 'Authentication initiated',
          description: 'Please complete the OAuth flow in the browser window that opened.',
        });
        
        // Poll for status updates
        const pollInterval = setInterval(async () => {
          const statusResult = await getMcpServerOAuthStatus(serverUuid);
          if (statusResult.success && statusResult.data?.isAuthenticated) {
            clearInterval(pollInterval);
            setStatus(statusResult.data);
            setLoading(false);
            toast({
              title: 'Authentication successful',
              description: 'You are now authenticated with this server.',
            });
          }
        }, 3000); // Poll every 3 seconds
        
        // Stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          setLoading(false);
        }, 300000);
        
      } else if (result.success) {
        // OAuth completed directly without URL (rare case)
        toast({
          title: 'Authentication successful',
          description: 'You are now authenticated with this server.',
        });
        await fetchStatus();
        setLoading(false);
        
      } else {
        // If OAuth isn't supported or configured, show info dialog
        if (result.error?.includes('not supported') || result.error?.includes('documentation')) {
          setShowInfoDialog(true);
        } else {
          toast({
            title: 'Authentication failed',
            description: result.error || 'Failed to initiate OAuth flow',
            variant: 'destructive',
          });
        }
        setLoading(false);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to initiate authentication',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleClearAuth = async () => {
    setLoading(true);
    try {
      const result = await clearMcpServerOAuth(serverUuid);
      if (result.success) {
        toast({
          title: 'Authentication cleared',
          description: 'OAuth tokens have been removed.',
        });
        await fetchStatus();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to clear authentication',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to clear authentication',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Default to showing not authenticated if no status
  const displayStatus = status || {
    isAuthenticated: false,
    hasActiveSession: false
  };

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              {displayStatus.isAuthenticated ? (
                <Badge variant="success" className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  <span>Authenticated</span>
                  {displayStatus.provider && <span>({displayStatus.provider})</span>}
                </Badge>
              ) : (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <ShieldOff className="h-3 w-3" />
                  <span>Not Authenticated</span>
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              {displayStatus.isAuthenticated ? (
                <>
                  <p>OAuth authentication is active</p>
                  {displayStatus.provider && <p>Provider: {displayStatus.provider}</p>}
                  {displayStatus.lastAuthenticated && (
                    <p>Since: {new Date(displayStatus.lastAuthenticated).toLocaleDateString()}</p>
                  )}
                </>
              ) : (
                <p>OAuth authentication required for full functionality</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="flex items-center gap-1">
        {!displayStatus.isAuthenticated && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAuthenticate}
            disabled={loading}
            className="h-7"
          >
            {loading ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <ExternalLink className="h-3 w-3 mr-1" />
                Authenticate
              </>
            )}
          </Button>
        )}

        {displayStatus.isAuthenticated && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchStatus}
              disabled={refreshing}
              className="h-7 px-2"
              title="Refresh status"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearAuth}
              disabled={loading}
              className="h-7 px-2 text-destructive hover:text-destructive"
              title="Clear authentication"
            >
              <ShieldOff className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
      
      <OAuthInfoDialog
        open={showInfoDialog}
        onOpenChange={setShowInfoDialog}
        serverName={serverName}
      />
    </div>
  );
}