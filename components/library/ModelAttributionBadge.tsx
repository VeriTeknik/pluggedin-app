'use client';

import { Bot } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ModelAttributionBadgeProps {
  modelName: string;
  modelProvider: string;
  modelVersion?: string;
  timestamp?: string;
  contributionType?: 'created' | 'updated';
  className?: string;
}

export function ModelAttributionBadge({
  modelName,
  modelProvider,
  modelVersion,
  timestamp,
  contributionType = 'created',
  className,
}: ModelAttributionBadgeProps) {
  const tooltipContent = (
    <div className="space-y-1">
      <p className="font-semibold">{modelName}</p>
      <p className="text-xs text-muted-foreground">Provider: {modelProvider}</p>
      {modelVersion && (
        <p className="text-xs text-muted-foreground">Version: {modelVersion}</p>
      )}
      {timestamp && (
        <p className="text-xs text-muted-foreground">
          {contributionType === 'created' ? 'Created' : 'Updated'}: {new Date(timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className={`flex items-center gap-1 ${className}`}>
            <Bot className="h-3 w-3" />
            <span className="text-xs">{modelName}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}