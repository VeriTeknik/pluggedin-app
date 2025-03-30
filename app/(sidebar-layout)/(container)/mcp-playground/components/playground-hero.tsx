'use client';

import { Activity, Code,Play, Power, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { McpServer } from '@/types/mcp-server';

interface PlaygroundHeroProps {
  isSessionActive: boolean;
  isProcessing: boolean;
  startSession: () => void;
  endSession: () => void;
  mcpServers?: McpServer[];
  llmConfig: {
    provider: string;
    model: string;
  };
}

export function PlaygroundHero({
  isSessionActive,
  isProcessing,
  startSession,
  endSession,
  mcpServers,
  llmConfig,
}: PlaygroundHeroProps) {
  const { t } = useTranslation();
  
  return (
    <Card className='bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-0 shadow-md overflow-hidden'>
      <CardContent className='p-6 md:p-8'>
        <div className='flex flex-col md:flex-row items-start md:items-center justify-between'>
          <div className='space-y-2'>
            <h1 className='text-2xl md:text-3xl font-bold tracking-tight'>
              {t('playground.title')}
            </h1>
            <p className='text-muted-foreground max-w-2xl'>
              {t('playground.subtitle')}
            </p>
          </div>
          <div className='mt-4 md:mt-0'>
            {!isSessionActive ? (
              <Button
                size='lg'
                className='bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                onClick={startSession}
                disabled={
                  isProcessing ||
                  mcpServers?.filter((s) => s.status === 'ACTIVE').length === 0
                }>
                {isProcessing ? (
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  <Play className='w-4 h-4 mr-2' />
                )}
                {isProcessing ? t('playground.actions.starting') : t('playground.actions.start')}
              </Button>
            ) : (
              <Button
                size='lg'
                variant='destructive'
                onClick={endSession}
                disabled={isProcessing}>
                {isProcessing ? (
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  <Power className='w-4 h-4 mr-2' />
                )}
                {isProcessing ? t('playground.actions.ending') : t('playground.actions.end')}
              </Button>
            )}
          </div>
        </div>

        {/* Session Status Indicator */}
        {isSessionActive && (
          <div className='mt-6 flex items-center'>
            <Badge
              variant='outline'
              className='bg-green-500/10 text-green-700 border-green-200 flex items-center gap-1.5'>
              <Activity className='h-3 w-3' />
              {t('playground.status.sessionActive')}
            </Badge>
            <Separator orientation='vertical' className='mx-3 h-4' />
            <div className='text-sm text-muted-foreground flex items-center gap-1.5'>
              <Server className='h-3.5 w-3.5' />
              {(() => {
                const activeCount = mcpServers?.filter((s) => s.status === 'ACTIVE').length || 0;
                return `${activeCount} ${activeCount === 1 ? 'server' : 'servers'} connected`;
              })()}
            </div>
            <Separator orientation='vertical' className='mx-3 h-4' />
            <div className='text-sm text-muted-foreground flex items-center gap-1.5'>
              <Code className='h-3.5 w-3.5' />
              {llmConfig.provider}: {llmConfig.model}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
