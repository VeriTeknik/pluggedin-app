'use client';

import {
  Save,
  Server,
  Terminal,
} from 'lucide-react';
import { useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { McpServer } from '@/types/mcp-server';

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
  
  // Effect to sync logLevel with llmConfig
  useEffect(() => {
    setLogLevel(llmConfig.logLevel);
  }, [llmConfig.logLevel, setLogLevel]);

  // Effect to sync llmConfig with logLevel
  useEffect(() => {
    setLlmConfig((prev: typeof llmConfig) => ({
      ...prev,
      logLevel: logLevel
    }));
  }, [logLevel, setLlmConfig]);

  return (
    <Card className='shadow-sm'>
      <CardHeader className='pb-3'>
        <CardTitle>{t('playground.config.title')}</CardTitle>
        <CardDescription>
          {t('playground.config.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                    <SelectItem value='anthropic'>Anthropic</SelectItem>
                    <SelectItem value='openai'>OpenAI</SelectItem>
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
                    setLogLevel(value as LogLevel)
                  }
                  disabled={isSessionActive}>
                  <SelectTrigger className='mt-1.5'>
                    <SelectValue placeholder={t('playground.config.model.logLevel')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='debug'>Debug</SelectItem>
                    <SelectItem value='info'>Info</SelectItem>
                    <SelectItem value='warn'>Warn</SelectItem>
                    <SelectItem value='error'>Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value='logs' className='space-y-4 mt-4'>
            {/* Top row with title and save button */}
            <div className='flex items-center justify-between mb-2'>
              <div className='text-sm font-medium flex items-center'>
                <Terminal className='w-4 h-4 mr-1.5' />
                {t('playground.config.logs.title')}
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={saveSettings}
                disabled={isSessionActive}
                className='h-7 text-xs'>
                <Save className='h-3 w-3 mr-1' />
                {t('playground.actions.save')}
              </Button>
            </div>
            
            {/* Second row with Clear button and log level controls */}
            <div className='flex items-center justify-between mb-2'>
              {clientLogs.length > 0 || serverLogs.length > 0 ? (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={clearLogs}
                  className='h-7 text-xs'>
                  {t('playground.actions.clear')}
                </Button>
              ) : (
                <div></div> // Empty div to maintain layout when no logs
              )}
              <div className="flex bg-secondary rounded-md p-0.5">
                {['error', 'warn', 'info', 'debug'].map((level) => (
                  <Button
                    key={level}
                    size="sm"
                    variant={logLevel === level ? 'secondary' : 'ghost'}
                    className={`h-6 text-xs px-2 capitalize ${
                      logLevel === level ? 'bg-background shadow-sm' : ''
                    } ${
                      level === 'error' ? 'text-red-500 hover:text-red-600' : 
                      level === 'warn' ? 'text-amber-500 hover:text-amber-600' : 
                      level === 'debug' ? 'text-blue-500 hover:text-blue-600' : 
                      'text-green-500 hover:text-green-600'
                    }`}
                    onClick={() => setLogLevel(level as LogLevel)}
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>
            
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
                  <div className="ml-3 flex-1">
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

            <ScrollArea className='h-[calc(100vh-24rem)] border rounded-md bg-muted/20'>
              <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground border-b border-muted-foreground/10">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${
                        logLevel === 'error' ? 'bg-red-500' : 
                        logLevel === 'warn' ? 'bg-amber-500' : 
                        logLevel === 'debug' ? 'bg-blue-500' : 
                        'bg-green-500'
                      }`}></div>
                      <span>{t('playground.config.logs.showingLevel', { level: logLevel })}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('playground.config.logs.levels')}</p>
                      <p className="text-xs mt-1">{t('playground.config.logs.levelsHint')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className='p-3 font-mono text-xs space-y-1.5'>
                {clientLogs.length === 0 && serverLogs.length === 0 ? (
                  <div className='text-muted-foreground text-center py-8'>
                    {t('playground.config.logs.empty')}
                  </div>
                ) : (
                  // Combine and sort client and server logs by timestamp
                  [...clientLogs.map(log => ({
                    source: 'client' as const,
                    type: log.type,
                    message: log.message,
                    timestamp: log.timestamp,
                    level: log.type === 'error' ? 'error' :
                           log.type === 'connection' ? 'warn' :
                           log.type === 'info' ? 'info' :
                           'info'
                  })),
                  ...serverLogs.map(log => ({
                    source: 'server' as const,
                    type: 'info',
                    message: log.message,
                    timestamp: log.timestamp,
                    level: log.level
                  }))]
                    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                    // Filter logs based on log level
                    .filter(log => {
                      // Special handling for logs with prefixes
                      if (log.message.startsWith('[DEBUG]')) {
                        return logLevel === 'debug';
                      }
                      if (log.message.startsWith('[WARN]')) {
                        return ['warn', 'info', 'debug'].includes(logLevel);
                      }
                      
                      const levels: { [key in LogLevel]: number } = {
                        error: 0,
                        warn: 1,
                        info: 2,
                        debug: 3
                      };
                      
                      const currentLogLevel = log.level || 'info';
                      return levels[logLevel] >= levels[currentLogLevel as LogLevel];
                    })
                    .map((log, index) => (
                      <div key={index} className='flex'>
                        <div className='text-muted-foreground mr-2'>
                          [{log.timestamp.toLocaleTimeString(undefined, {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'})}]
                        </div>
                        <div
                          className={`
                          ${log.source === 'server' ? 'text-violet-500' : ''}
                          ${log.type === 'info' ? 'text-blue-500' : ''}
                          ${log.type === 'error' ? 'text-red-500' : ''}
                          ${log.type === 'connection' ? 'text-green-500' : ''}
                          ${log.type === 'execution' ? 'text-amber-500' : ''}
                          ${log.type === 'response' ? 'text-purple-500' : ''}
                        `}>
                          {log.message.startsWith('[DEBUG]') ? (
                            <span className="text-blue-400">[DEBUG]</span>
                          ) : log.message.startsWith('[WARN]') ? (
                            <span className="text-amber-400">[WARN]</span>
                          ) : log.source === 'server' ? (
                            <span className="text-violet-400">[SERVER:{log.level.toUpperCase()}]</span>
                          ) : (
                            <span>[{log.type.toUpperCase()}]</span>
                          )}{' '}
                          {log.message.startsWith('[DEBUG]') ? 
                            log.message.substring(7) : 
                            log.message.startsWith('[WARN]') ?
                            log.message.substring(6) :
                            log.message}
                        </div>
                      </div>
                    ))
                )}
                <div ref={logsEndRef} />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
