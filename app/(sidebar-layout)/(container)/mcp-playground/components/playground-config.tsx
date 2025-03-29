'use client';

import { Save, Server, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { McpServer } from '@/types/mcp-server';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  type: 'info' | 'error' | 'connection' | 'execution' | 'response';
  message: string;
  timestamp: Date;
}

interface ServerLogEntry {
  level: string;
  message: string;
  timestamp: Date;
}

interface PlaygroundConfigProps {
  isLoading: boolean;
  mcpServers?: McpServer[];
  isSessionActive: boolean;
  isProcessing: boolean;
  isUpdatingServer: string | null;
  sessionError: string | null;
  setSessionError: (error: string | null) => void;
  toggleServerStatus: (serverUuid: string, status: boolean) => Promise<void>;
  llmConfig: {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
    logLevel: LogLevel;
  };
  setLlmConfig: (config: any) => void;
  logLevel: LogLevel;
  setLogLevel: (level: LogLevel) => void;
  clientLogs: LogEntry[];
  serverLogs: ServerLogEntry[];
  clearLogs: () => void;
  saveSettings: () => Promise<void>;
  logsEndRef: React.RefObject<HTMLDivElement>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function PlaygroundConfig({
  isLoading,
  mcpServers,
  isSessionActive,
  isUpdatingServer,
  sessionError,
  setSessionError,
  toggleServerStatus,
  llmConfig,
  setLlmConfig,
  logLevel,
  setLogLevel,
  clientLogs,
  serverLogs,
  clearLogs,
  saveSettings,
  logsEndRef,
  activeTab,
  setActiveTab,
}: PlaygroundConfigProps) {
  const { t } = useTranslation();
  
  // Create a ref to track previous log level value
  const prevLogLevelRef = useRef(logLevel);
  const logLevelChangeTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Fix the settings saved loop with a single, properly controlled useEffect
  useEffect(() => {
    // Only trigger save if the log level actually changed
    if (prevLogLevelRef.current !== logLevel) {
      // Clear any existing timers
      if (logLevelChangeTimerRef.current) {
        clearTimeout(logLevelChangeTimerRef.current);
      }
      
      // Update llmConfig when logLevel changes (without triggering another render)
      if (llmConfig.logLevel !== logLevel) {
        setLlmConfig((prev: typeof llmConfig) => ({
          ...prev,
          logLevel: logLevel
        }));
      }
      
      // Debounced save with longer timeout to avoid rapid consecutive saves
      logLevelChangeTimerRef.current = setTimeout(() => {
        saveSettings().then(() => {
          // Update previous value reference AFTER the save completes
          prevLogLevelRef.current = logLevel;
        });
        logLevelChangeTimerRef.current = null;
      }, 1000);
    }
    
    // Cleanup function
    return () => {
      if (logLevelChangeTimerRef.current) {
        clearTimeout(logLevelChangeTimerRef.current);
      }
    };
  }, [logLevel, llmConfig.logLevel, setLlmConfig, saveSettings]);
  
  // Handler to update log level without triggering save cascade
  const handleLogLevelChange = (level: LogLevel) => {
    if (level !== logLevel) {
      setLogLevel(level);
    }
  };

  // The renderLogEntry function previously here was removed as it was unused.
  // Log rendering is handled inline within the 'logs' tab content below.

  return (
    <Card className='shadow-sm h-[calc(100vh-12rem)] flex flex-col'>
      <CardHeader className='pb-3 flex-shrink-0'>
        <CardTitle>{t('playground.config.title')}</CardTitle>
        <CardDescription>
          {t('playground.config.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex-1 overflow-hidden'>
        <Tabs defaultValue='servers' value={activeTab} onValueChange={setActiveTab}>
          <TabsList className='grid w-full grid-cols-3'>
            <TabsTrigger value='servers'>{t('playground.config.tabs.servers')}</TabsTrigger>
            <TabsTrigger value='llm'>{t('playground.config.tabs.llm')}</TabsTrigger>
            <TabsTrigger value='logs' className="relative">
              {t('playground.config.tabs.logs')}
              {isSessionActive && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* Servers Tab */}
          <TabsContent value='servers' className='space-y-4 mt-4'>
            {isLoading ? (
              <div className='flex items-center justify-center py-8'>
                <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
              </div>
            ) : mcpServers?.length === 0 ? (
              <div className='text-center p-6 bg-muted/50 rounded-lg'>
                <Server className='h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50' />
                <p className='text-muted-foreground font-medium'>
                  {t('playground.config.noServers.title')}
                </p>
                <Button
                  variant='link'
                  className='mt-2'
                  onClick={() => (window.location.href = '/mcp-servers')}>
                  {t('playground.config.noServers.action')}
                </Button>
              </div>
            ) : (
              <div className='space-y-3'>
                {sessionError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md mb-4">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 text-red-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="8" x2="12" y2="12"></line>
                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">{t('playground.config.sessionError.title')}</h3>
                        <div className="mt-1 text-sm text-red-700">
                          {sessionError}
                        </div>
                        <div className="mt-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-xs"
                            onClick={() => setSessionError(null)}
                          >
                            {t('playground.actions.dismiss')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {mcpServers?.map((server: McpServer) => (
                  <TooltipProvider key={server.uuid}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center justify-between p-2.5 rounded-md transition-colors ${
                            server.status === 'ACTIVE'
                              ? 'bg-secondary/50'
                              : 'hover:bg-muted/50'
                          }`}>
                          <div className='flex-1'>
                            <div className='flex items-center'>
                              <div className='font-medium'>
                                {server.name}
                              </div>
                              {server.status === 'ACTIVE' ? (
                                <Badge
                                  variant='outline'
                                  className='ml-2 bg-green-500/10 text-green-700 border-green-200'>
                                  {t('playground.status.active')}
                                </Badge>
                              ) : (
                                <Badge
                                  variant='outline'
                                  className='ml-2 bg-amber-500/10 text-amber-700 border-amber-200'>
                                  {t('playground.status.inactive')}
                                </Badge>
                              )}
                            </div>
                            <div className='text-sm text-muted-foreground flex items-center'>
                              <Badge
                                variant='secondary'
                                className='mr-1.5 py-0 px-1.5 h-5 font-normal'>
                                {server.type}
                              </Badge>
                              {server.description && server.description}
                            </div>
                          </div>
                          <Switch
                            checked={server.status === 'ACTIVE'}
                            onCheckedChange={(checked) =>
                              toggleServerStatus(server.uuid, checked)
                            }
                            disabled={
                              isSessionActive ||
                              isUpdatingServer === server.uuid
                            }
                            className='ml-2'
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side='right'>
                        <div className='space-y-1 max-w-xs'>
                          <p className='font-medium'>{server.name}</p>
                          <p className='text-xs'>{server.description}</p>
                          <div className='text-xs flex items-center space-x-1'>
                            <span>Type:</span>
                            <Badge
                              variant='secondary'
                              className='py-0 px-1.5 h-4 font-normal'>
                              {server.type}
                            </Badge>
                          </div>
                          {server.command && (
                            <p className='text-xs'>
                              Command: {server.command}
                            </p>
                          )}
                          {server.url && (
                            <p className='text-xs'>URL: {server.url}</p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            )}
          </TabsContent>

          {/* LLM Tab */}
          <TabsContent value='llm' className='space-y-4 mt-4'>
            <div className='flex items-center justify-between mb-4'>
              <div className='bg-muted/30 p-4 rounded-lg flex-1'>
                <div className='text-sm font-medium mb-2'>{t('playground.config.model.title')}</div>
                <div className='flex items-center'>
                  <Badge className='bg-primary/10 text-primary border-primary/20 py-1.5 px-3'>
                    {llmConfig.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                  </Badge>
                  <Separator orientation='vertical' className='mx-3 h-5' />
                  <div className='text-sm font-medium'>{llmConfig.model}</div>
                </div>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={saveSettings}
                disabled={isSessionActive}>
                <Save className='mr-2 h-4 w-4' />
                {t('playground.actions.save')}
              </Button>
            </div>

            <div className='space-y-4'>
              <div>
                <Label htmlFor='provider' className='text-sm font-medium'>
                  {t('playground.config.model.provider')}
                </Label>
                <Select
                  value={llmConfig.provider}
                  onValueChange={(value) =>
                    setLlmConfig({ ...llmConfig, provider: value as 'anthropic' | 'openai' })
                  }
                  disabled={isSessionActive}>
                  <SelectTrigger className='mt-1.5'>
                    <SelectValue placeholder={t('playground.config.model.provider')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='anthropic'>{t('playground.provider.anthropic')}</SelectItem>
                    <SelectItem value='openai'>{t('playground.provider.openai')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor='model' className='text-sm font-medium'>
                  {t('playground.config.model.model')}
                </Label>
                <Select
                  value={llmConfig.model}
                  onValueChange={(value) =>
                    setLlmConfig({ ...llmConfig, model: value })
                  }
                  disabled={isSessionActive}>
                  <SelectTrigger className='mt-1.5'>
                    <SelectValue placeholder={t('playground.config.model.model')} />
                  </SelectTrigger>
                  <SelectContent>
                    {llmConfig.provider === 'anthropic' ? (
                      <>
                        <SelectItem value='claude-3-7-sonnet-20250219'>
                          Claude 3.7 Sonnet
                        </SelectItem>
                        <SelectItem value='claude-3-5-sonnet-20240620'>
                          Claude 3.5 Sonnet
                        </SelectItem>
                        <SelectItem value='claude-3-opus-20240229'>
                          Claude 3 Opus
                        </SelectItem>
                        <SelectItem value='claude-3-sonnet-20240229'>
                          Claude 3 Sonnet
                        </SelectItem>
                        <SelectItem value='claude-3-haiku-20240307'>
                          Claude 3 Haiku
                        </SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value='gpt-4o-2024-05-13'>
                          GPT-4o
                        </SelectItem>
                        <SelectItem value='gpt-4o-mini-2024-07-18'>
                          GPT-4o Mini
                        </SelectItem>
                        <SelectItem value='gpt-4-turbo-2024-04-09'>
                          GPT-4 Turbo
                        </SelectItem>
                        <SelectItem value='gpt-3.5-turbo-0125'>
                          GPT-3.5 Turbo
                        </SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className='flex justify-between items-center'>
                  <Label
                    htmlFor='temperature'
                    className='text-sm font-medium'>
                    {t('playground.config.model.temperature')}
                  </Label>
                  <span className='text-sm text-muted-foreground'>
                    {llmConfig.temperature}
                  </span>
                </div>
                <Input
                  id='temperature'
                  type='range'
                  min='0'
                  max='1'
                  step='0.1'
                  value={llmConfig.temperature}
                  onChange={(e) =>
                    setLlmConfig({
                      ...llmConfig,
                      temperature: parseFloat(e.target.value),
                    })
                  }
                  disabled={isSessionActive}
                  className='mt-1.5'
                />
                <div className='flex justify-between text-xs text-muted-foreground mt-1'>
                  <span>{t('playground.config.model.temperatureHints.precise')}</span>
                  <span>{t('playground.config.model.temperatureHints.creative')}</span>
                </div>
              </div>

              <div>
                <div className='flex justify-between items-center'>
                  <Label
                    htmlFor='maxTokens'
                    className='text-sm font-medium'>
                    {t('playground.config.model.maxTokens')}
                  </Label>
                  <span className='text-sm text-muted-foreground'>
                    {llmConfig.maxTokens}
                  </span>
                </div>
                <Input
                  id='maxTokens'
                  type='range'
                  min='100'
                  max='4000'
                  step='100'
                  value={llmConfig.maxTokens}
                  onChange={(e) =>
                    setLlmConfig({
                      ...llmConfig,
                      maxTokens: parseInt(e.target.value),
                    })
                  }
                  disabled={isSessionActive}
                  className='mt-1.5'
                />
              </div>

              <div>
                <Label htmlFor='logLevel' className='text-sm font-medium'>
                  {t('playground.config.model.logLevel')}
                </Label>
                <Select
                  value={logLevel}
                  onValueChange={(value) =>
                    handleLogLevelChange(value as LogLevel)
                  }
                  disabled={isSessionActive}>
                  <SelectTrigger className='mt-1.5'>
                    <SelectValue placeholder={t('playground.config.model.logLevel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Use corrected keys */}
                    <SelectItem value='debug'>{t('playground.logLevels.debug')}</SelectItem>
                    <SelectItem value='info'>{t('playground.logLevels.info')}</SelectItem>
                    <SelectItem value='warn'>{t('playground.logLevels.warn')}</SelectItem>
                    <SelectItem value='error'>{t('playground.logLevels.error')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value='logs' className='space-y-4 mt-4'>
            {/* Reverted Layout: Side-by-side */}
            <div className='flex items-center justify-between mb-2'>
              <div>
                {/* Ensure correct key is used here */}
                <Label className='text-sm font-medium mb-1 block sr-only'> {/* Hide label visually, keep for accessibility */}
                  {t('playground.config.model.logLevel')}
                </Label>
                <Select
                  value={logLevel}
                  onValueChange={handleLogLevelChange}
                  disabled={isSessionActive}>
                  <SelectTrigger className='w-40'> {/* Restored width */}
                    {/* Ensure correct key is used here */}
                    <SelectValue placeholder={t('playground.config.model.logLevel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Use corrected keys */}
                    <SelectItem value='error'>{t('playground.logLevels.error')}</SelectItem>
                    <SelectItem value='warn'>{t('playground.logLevels.warn')}</SelectItem>
                    <SelectItem value='info'>{t('playground.logLevels.info')}</SelectItem>
                    <SelectItem value='debug'>{t('playground.logLevels.debug')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={clearLogs}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  {t('playground.actions.clearLogs')}
                </Button>
              </div>
            </div>

            {/* Restored original height calculation */}
            <div className="h-[calc(100vh-25rem)] rounded-md border">
              {serverLogs.length === 0 && clientLogs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  {t('playground.logs.empty')}
                </div>
              ) : (
                <div 
                  className="h-full overflow-auto" 
                  onScroll={(e) => {
                    // Prevent any attempt to automatically scroll
                    e.stopPropagation();
                  }}
                  data-user-scroll="true"
                >
                  {/* Simplified logs display for better performance and readability */}
                  <div className="space-y-0.5 p-2">
                    {(() => {
                      // Combine and sort logs
                      const allLogs = [
                        ...clientLogs.map(log => ({
                          type: 'client' as const,
                          timestamp: log.timestamp,
                          level: log.type,
                          message: log.message
                        })),
                        ...serverLogs.map(log => ({
                          type: 'server' as const,
                          timestamp: new Date(log.timestamp),
                          level: log.level,
                          message: log.message
                        }))
                      ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                      
                      // Truncate very long messages
                      const truncateText = (text: string, maxLength = 200) => {
                        if (!text) return '';
                        if (text.length <= maxLength) return text;
                        return text.substring(0, maxLength) + '...';
                      };
                      
                      // Filter for giant messages (potential issues)
                      const isLikelyBinary = (text: string) => {
                        // Check for signs of binary data or very long single-line content
                        return text.length > 500 && !text.includes('\n') && /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/.test(text);
                      };
                      
                      return allLogs.map((log, index) => {
                        // Format timestamp
                        const time = log.timestamp.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit', 
                          second: '2-digit' 
                        });
                        
                        // Get appropriate style
                        let levelStyle = '';
                        if (log.type === 'client') {
                          levelStyle = log.level === 'error' 
                            ? 'text-red-500 font-bold'
                            : log.level === 'info'
                              ? 'text-blue-500'
                              : log.level === 'execution'
                                ? 'text-yellow-500'
                                : log.level === 'connection'
                                  ? 'text-green-500'
                                  : 'text-purple-500';
                        } else {
                          levelStyle = {
                            error: 'text-red-500 font-semibold',
                            warn: 'text-yellow-500 font-semibold',
                            info: 'text-blue-500',
                            debug: 'text-green-500',
                            streaming: 'text-purple-500 italic'
                          }[log.level as string] || '';
                        }
                        
                        // Handle special message formats
                        let cleanedMessage = log.message;
                        
                        // Check for binary-looking data
                        if (isLikelyBinary(cleanedMessage)) {
                          cleanedMessage = '[Binary data or invalid text content - hidden for display]';
                        }
                        
                        return (
                          <div 
                            key={`log-${log.type}-${index}`} 
                            className="py-1 border-b border-border/10 text-xs last:border-0 hover:bg-muted/40 transition-colors"
                          >
                            <div className="grid grid-cols-[auto_auto_1fr] gap-2">
                              <span className="text-muted-foreground whitespace-nowrap">
                                [{time}]
                              </span>
                              <span className={`${levelStyle} uppercase whitespace-nowrap`}>
                                [{log.level}]
                              </span>
                              <span className="whitespace-pre-wrap break-words overflow-hidden">
                                {truncateText(cleanedMessage)}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
