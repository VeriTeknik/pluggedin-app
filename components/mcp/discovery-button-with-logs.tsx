'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { discoverServerWithLogs } from '@/app/actions/discovery-logged';
import { Loader2, Terminal } from 'lucide-react';

interface DiscoveryButtonWithLogsProps {
  serverUuid: string;
  serverName?: string;
  onSuccess?: () => void;
  className?: string;
}

export function DiscoveryButtonWithLogs({
  serverUuid,
  serverName = 'server',
  onSuccess,
  className,
}: DiscoveryButtonWithLogsProps) {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const { toast } = useToast();

  const handleDiscover = async () => {
    setIsDiscovering(true);
    
    try {
      const result = await discoverServerWithLogs(serverUuid);
      
      if (result.success) {
        // Show success toast with logs in CLI style
        toast({
          title: 'Discovery Complete',
          description: (
            <div className="mt-2">
              <div className="mb-2 text-sm text-muted-foreground">
                Successfully discovered {serverName}
              </div>
              {result.logs.length > 0 && (
                <div className="rounded-md bg-black p-3 font-mono text-xs text-green-400">
                  <div className="flex items-center gap-2 mb-2 text-white">
                    <Terminal className="h-3 w-3" />
                    <span>Console Output</span>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {result.logs.map((log, index) => (
                      <div key={index} className="whitespace-pre-wrap break-all">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ),
          duration: 10000, // Show for 10 seconds to allow reading logs
        });
        
        onSuccess?.();
      } else {
        // Show error toast with logs
        toast({
          variant: 'destructive',
          title: 'Discovery Failed',
          description: (
            <div className="mt-2">
              <div className="mb-2 text-sm">
                {result.error || 'Failed to discover server'}
              </div>
              {result.logs.length > 0 && (
                <div className="rounded-md bg-black p-3 font-mono text-xs text-red-400">
                  <div className="flex items-center gap-2 mb-2 text-white">
                    <Terminal className="h-3 w-3" />
                    <span>Console Output</span>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {result.logs.map((log, index) => (
                      <div key={index} className="whitespace-pre-wrap break-all">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ),
          duration: 10000,
        });
      }
    } catch (error) {
      // Handle unexpected errors
      toast({
        variant: 'destructive',
        title: 'Unexpected Error',
        description: error instanceof Error ? error.message : 'Something went wrong',
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <Button
      onClick={handleDiscover}
      disabled={isDiscovering}
      className={className}
      variant="outline"
    >
      {isDiscovering ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Discovering...
        </>
      ) : (
        <>
          <Terminal className="mr-2 h-4 w-4" />
          Discover with Logs
        </>
      )}
    </Button>
  );
}

/**
 * Alternative component that shows logs in a modal/dialog instead of toast
 */
export function DiscoveryButtonWithLogsModal({
  serverUuid,
  serverName = 'server',
  onSuccess,
  className,
}: DiscoveryButtonWithLogsProps) {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  
  // Implementation would include a dialog/modal to show logs
  // This is just a placeholder to demonstrate the pattern
  
  return (
    <Button
      onClick={() => {
        // Handle discovery and show logs in modal
      }}
      disabled={isDiscovering}
      className={className}
      variant="outline"
    >
      <Terminal className="mr-2 h-4 w-4" />
      Discover (Modal)
    </Button>
  );
}