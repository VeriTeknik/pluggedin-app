'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  Brain,
  Calendar,
  FileText,
  Hash,
  Info,
  MessageSquare,
  Settings,
  Sparkles,
  Thermometer,
  Type
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ModelAttributionBadge } from '@/components/library/ModelAttributionBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface AIMetadata {
  model?: {
    name: string;
    provider: string;
    version?: string;
  };
  context?: string;
  timestamp?: string;
  sessionId?: string;
  prompt?: string;
  conversationContext?: Array<{
    role: string;
    content: string;
  }>;
  sourceDocuments?: string[];
  generationParams?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  lastUpdatedBy?: {
    name: string;
    provider: string;
    version?: string;
  };
  lastUpdateTimestamp?: string;
}

interface AIMetadataPanelProps {
  metadata: AIMetadata | null;
  documentName?: string;
  source?: 'upload' | 'ai_generated' | 'api';
  version?: number;
  className?: string;
  onSourceDocumentClick?: (documentId: string) => void;
}

export function AIMetadataPanel({
  metadata,
  documentName,
  source,
  version = 1,
  className,
  onSourceDocumentClick,
}: AIMetadataPanelProps) {
  const { t } = useTranslation('library');

  if (!metadata || source !== 'ai_generated') {
    return null;
  }

  const temperaturePercentage = metadata.generationParams?.temperature
    ? (metadata.generationParams.temperature / 2) * 100
    : 0;

  const topPPercentage = metadata.generationParams?.topP
    ? metadata.generationParams.topP * 100
    : 0;

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          {t('metadata.title', 'AI Generation Details')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Model Information */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4" />
            {t('metadata.model', 'Model Information')}
          </h3>
          <div className="space-y-2">
            {metadata.model && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('metadata.createdBy', 'Created by')}
                </span>
                <ModelAttributionBadge
                  modelName={metadata.model.name}
                  modelProvider={metadata.model.provider}
                  modelVersion={metadata.model.version}
                />
              </div>
            )}
            {metadata.lastUpdatedBy && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('metadata.lastUpdatedBy', 'Last updated by')}
                </span>
                <ModelAttributionBadge
                  modelName={metadata.lastUpdatedBy.name}
                  modelProvider={metadata.lastUpdatedBy.provider}
                  modelVersion={metadata.lastUpdatedBy.version}
                />
              </div>
            )}
            {version > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('metadata.version', 'Version')}
                </span>
                <Badge variant="outline">v{version}</Badge>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Generation Context */}
        {(metadata.prompt || metadata.context) && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {t('metadata.generationContext', 'Generation Context')}
              </h3>

              {metadata.prompt && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Type className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('metadata.prompt', 'Prompt')}
                    </span>
                  </div>
                  <ScrollArea className="h-24 w-full rounded-md border p-2">
                    <p className="text-sm whitespace-pre-wrap">
                      {metadata.prompt}
                    </p>
                  </ScrollArea>
                </div>
              )}

              {metadata.context && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Info className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('metadata.context', 'Additional Context')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                    {metadata.context}
                  </p>
                </div>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Conversation Context */}
        {metadata.conversationContext && metadata.conversationContext.length > 0 && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {t('metadata.conversationHistory', 'Conversation History')}
                <Badge variant="secondary" className="ml-auto">
                  {metadata.conversationContext.length} {t('metadata.messages', 'messages')}
                </Badge>
              </h3>
              <ScrollArea className="h-32 w-full rounded-md border">
                <div className="p-3 space-y-2">
                  {metadata.conversationContext.map((message, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "text-sm p-2 rounded-md",
                        message.role === 'user' ? "bg-blue-50 dark:bg-blue-950/30" :
                        message.role === 'assistant' ? "bg-muted/50" : "bg-muted/30"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-muted-foreground capitalize">
                          {message.role || 'system'}:
                        </span>
                        <span className="flex-1">
                          {message.content.substring(0, 150)}
                          {message.content.length > 150 && '...'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <Separator />
          </>
        )}

        {/* Source Documents */}
        {metadata.sourceDocuments && metadata.sourceDocuments.length > 0 && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t('metadata.sourceDocuments', 'Source Documents')}
                <Badge variant="secondary" className="ml-auto">
                  {metadata.sourceDocuments.length}
                </Badge>
              </h3>
              <div className="space-y-2">
                {metadata.sourceDocuments.map((docId, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSourceDocumentClick?.(docId)}
                    className="w-full text-left p-2 rounded-md border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm truncate">
                        {docId}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Generation Parameters */}
        {metadata.generationParams && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('metadata.generationParams', 'Generation Parameters')}
              </h3>
              <div className="space-y-3">
                {metadata.generationParams.temperature !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Thermometer className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {t('metadata.temperature', 'Temperature')}
                        </span>
                      </div>
                      <span className="font-mono text-xs">
                        {metadata.generationParams.temperature.toFixed(2)}
                      </span>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Progress value={temperaturePercentage} className="h-1" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            {temperaturePercentage < 25 && t('metadata.tempVeryFocused', 'Very focused')}
                            {temperaturePercentage >= 25 && temperaturePercentage < 50 && t('metadata.tempFocused', 'Focused')}
                            {temperaturePercentage >= 50 && temperaturePercentage < 75 && t('metadata.tempBalanced', 'Balanced')}
                            {temperaturePercentage >= 75 && t('metadata.tempCreative', 'Creative')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}

                {metadata.generationParams.topP !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Brain className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {t('metadata.topP', 'Top-P')}
                        </span>
                      </div>
                      <span className="font-mono text-xs">
                        {metadata.generationParams.topP.toFixed(2)}
                      </span>
                    </div>
                    <Progress value={topPPercentage} className="h-1" />
                  </div>
                )}

                {metadata.generationParams.maxTokens !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {t('metadata.maxTokens', 'Max Tokens')}
                      </span>
                    </div>
                    <span className="font-mono text-xs">
                      {metadata.generationParams.maxTokens.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Timestamps */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {t('metadata.timestamps', 'Timestamps')}
          </h3>
          <div className="space-y-1 text-sm">
            {metadata.timestamp && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('metadata.created', 'Created')}
                </span>
                <span className="font-mono text-xs">
                  {formatDistanceToNow(new Date(metadata.timestamp), { addSuffix: true })}
                </span>
              </div>
            )}
            {metadata.lastUpdateTimestamp && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('metadata.lastUpdated', 'Last updated')}
                </span>
                <span className="font-mono text-xs">
                  {formatDistanceToNow(new Date(metadata.lastUpdateTimestamp), { addSuffix: true })}
                </span>
              </div>
            )}
            {metadata.sessionId && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('metadata.sessionId', 'Session ID')}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {metadata.sessionId.substring(0, 8)}...
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}