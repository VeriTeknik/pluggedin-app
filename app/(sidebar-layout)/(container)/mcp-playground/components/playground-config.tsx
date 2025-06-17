'use client';

import { Server, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { PlaygroundSettings } from '@/app/actions/playground-settings';
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

export type PlaygroundConfigFormValues = PlaygroundSettings & {
  serverUuid?: string;
};

export interface PlaygroundConfigProps {
  logsEndRef?: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  mcpServers?: McpServer[];
  clearLogs: () => void;
  saveSettings: () => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSessionActive: boolean;
  isProcessing: boolean;
  isUpdatingServer: string | null;
  sessionError: string | null;
  setSessionError: (error: string | null) => void;
  toggleServerStatus: (serverUuid: string, status: boolean) => Promise<void>;
  llmConfig: PlaygroundConfigFormValues;
  setLlmConfig: (config: PlaygroundConfigFormValues | ((prev: PlaygroundConfigFormValues) => PlaygroundConfigFormValues)) => void;
  switchModel: (config: PlaygroundConfigFormValues) => Promise<void>;
  logLevel: LogLevel;
  setLogLevel: (level: LogLevel) => void;
  clientLogs: LogEntry[];
  serverLogs: ServerLogEntry[];
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
  switchModel,
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
  
  // Create a ref to track previous ragEnabled value
  const prevRagEnabledRef = useRef(llmConfig.ragEnabled);
  
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

  // Auto-save when ragEnabled changes (prevents race conditions vs setTimeout)
  useEffect(() => {
    // Only save if ragEnabled actually changed and it's not the initial render
    if (prevRagEnabledRef.current !== llmConfig.ragEnabled && prevRagEnabledRef.current !== undefined) {
      const saveRagSettings = async () => {
        try {
          await saveSettings();
          console.log('[RAG DEBUG] Settings auto-saved after RAG toggle change');
        } catch (error) {
          console.error('[RAG DEBUG] Failed to auto-save settings:', error);
        }
      };
      
      saveRagSettings();
    }
    
    // Update the previous value reference
    prevRagEnabledRef.current = llmConfig.ragEnabled;
  }, [llmConfig.ragEnabled, saveSettings]);
  
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
        <Tabs defaultValue='servers' value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
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
          <TabsContent value='servers' className='flex-1 mt-4 overflow-y-auto pr-2'>
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
                          className={`flex items-start justify-between p-3 rounded-lg border transition-colors ${
                            server.status === 'ACTIVE'
                              ? 'bg-secondary/50 border-primary/20'
                              : 'hover:bg-muted/50 border-muted'
                          }`}>
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-center'>
                              <div className='font-medium truncate pr-2'>
                                {server.name}
                              </div>
                              {server.status === 'ACTIVE' ? (
                                <Badge
                                  variant='outline'
                                  className='ml-2 bg-green-500/10 text-green-700 border-green-200 flex-shrink-0'>
                                  {t('playground.status.active')}
                                </Badge>
                              ) : (
                                <Badge
                                  variant='outline'
                                  className='ml-2 bg-amber-500/10 text-amber-700 border-amber-200 flex-shrink-0'>
                                  {t('playground.status.inactive')}
                                </Badge>
                              )}
                            </div>
                            <div className='text-sm text-muted-foreground flex items-center'>
                              <Badge
                                variant='secondary'
                                className='mr-1.5 py-0 px-1.5 h-5 font-normal flex-shrink-0'>
                                {server.type}
                              </Badge>
                              {server.description && (
                                <span className='truncate'>{server.description}</span>
                              )}
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
          <TabsContent value='llm' className='flex-1 mt-4 overflow-y-auto pr-2'>
            <div className='space-y-6'>
              
              {/* Provider Selection */}
              <div className='space-y-3'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>{t('playground.config.model.provider')}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    Auto-saved
                  </div>
                </div>
                <div className='grid grid-cols-3 gap-4'>
                  {/* Anthropic Card */}
                  <div 
                    className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
                      llmConfig.provider === 'anthropic' 
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                        : 'border-muted hover:bg-muted/50'
                    }`}
                    onClick={() => setLlmConfig({ ...llmConfig, provider: 'anthropic' })}
                  >
                    {llmConfig.provider === 'anthropic' && (
                      <div className="absolute top-2 right-2">
                        <div className="h-3 w-3 rounded-full bg-primary"></div>
                      </div>
                    )}
                    <div className='text-center space-y-2'>
                      <div className='w-8 h-8 mx-auto bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center'>
                        <span className='text-white font-bold text-sm'>A</span>
                      </div>
                      <div className='font-medium text-sm truncate'>Anthropic</div>
                      <div className='text-xs text-muted-foreground'>7 models</div>
                    </div>
                  </div>

                  {/* OpenAI Card */}
                  <div 
                    className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
                      llmConfig.provider === 'openai' 
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                        : 'border-muted hover:bg-muted/50'
                    }`}
                    onClick={() => setLlmConfig({ ...llmConfig, provider: 'openai' })}
                  >
                    {llmConfig.provider === 'openai' && (
                      <div className="absolute top-2 right-2">
                        <div className="h-3 w-3 rounded-full bg-primary"></div>
                      </div>
                    )}
                    <div className='text-center space-y-2'>
                      <div className='w-8 h-8 mx-auto bg-gradient-to-br from-green-500 to-teal-500 rounded-lg flex items-center justify-center'>
                        <span className='text-white font-bold text-sm'>O</span>
                      </div>
                      <div className='font-medium text-sm truncate'>OpenAI</div>
                      <div className='text-xs text-muted-foreground'>6 models</div>
                    </div>
                  </div>

                  {/* Google Card */}
                  <div 
                    className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
                      llmConfig.provider === 'google' 
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                        : 'border-muted hover:bg-muted/50'
                    }`}
                    onClick={() => setLlmConfig({ ...llmConfig, provider: 'google' })}
                  >
                    {llmConfig.provider === 'google' && (
                      <div className="absolute top-2 right-2">
                        <div className="h-3 w-3 rounded-full bg-primary"></div>
                      </div>
                    )}
                    <div className='text-center space-y-2'>
                      <div className='w-8 h-8 mx-auto bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center'>
                        <span className='text-white font-bold text-sm'>G</span>
                      </div>
                      <div className='font-medium text-sm truncate'>Google</div>
                      <div className='text-xs text-muted-foreground'>3 models</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Model Configuration Card */}
              <Card className='border-2 border-primary/20 bg-primary/5'>
                <CardHeader className='pb-4'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <CardTitle className='text-lg'>Selected Model</CardTitle>
                      <CardDescription>Currently using {llmConfig.provider === 'anthropic' ? 'Anthropic' : llmConfig.provider === 'openai' ? 'OpenAI' : 'Google'}</CardDescription>
                    </div>
                    <Badge className='bg-primary text-primary-foreground px-3 py-1'>
                      {llmConfig.provider === 'anthropic' ? 'Anthropic' : llmConfig.provider === 'openai' ? 'OpenAI' : 'Google'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div>
                    <Label htmlFor='model' className='text-sm font-medium mb-3 block'>
                      {t('playground.config.model.model')}
                    </Label>
                    <div className='grid grid-cols-2 gap-4'>
                      {llmConfig.provider === 'anthropic' ? (
                        <>
                          {[
                            { value: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', desc: 'Balanced reasoning', badge: 'New' },
                            { value: 'claude-4-sonnet-20250514', name: 'Claude 4 Sonnet', desc: 'Superior intelligence', badge: 'Latest' },
                            { value: 'claude-4-opus-20250514', name: 'Claude 4 Opus', desc: 'Most powerful', badge: 'Pro' },
                            { value: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', desc: 'Fast & capable' },
                            { value: 'claude-3-opus-20240229', name: 'Claude 3 Opus', desc: 'Creative tasks' },
                            { value: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', desc: 'Quick responses' }
                          ].map((model) => (
                            <div
                              key={model.value}
                              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                llmConfig.model === model.value
                                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                                  : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                              }`}
                              onClick={() => switchModel({ ...llmConfig, model: model.value })}
                            >
                              <div className='flex items-start justify-between gap-2'>
                                <div className='min-w-0 flex-1'>
                                  <div className='font-medium text-sm truncate'>{model.name}</div>
                                  <div className='text-xs text-muted-foreground truncate'>{model.desc}</div>
                                </div>
                                {model.badge && (
                                  <Badge variant="secondary" className='text-xs flex-shrink-0'>{model.badge}</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      ) : llmConfig.provider === 'openai' ? (
                        <>
                          {[
                            { value: 'gpt-4.1-2025-04-14', name: 'GPT-4.1', desc: 'Latest flagship', badge: 'New' },
                            { value: 'gpt-4.1-mini-2025-04-14', name: 'GPT-4.1 Mini', desc: 'Cost efficient', badge: 'New' },
                            { value: 'gpt-4o-2024-05-13', name: 'GPT-4o', desc: 'Multimodal' },
                            { value: 'gpt-4o-mini-2024-07-18', name: 'GPT-4o Mini', desc: 'Fast & affordable' },
                            { value: 'gpt-4-turbo-2024-04-09', name: 'GPT-4 Turbo', desc: 'High performance' },
                            { value: 'gpt-3.5-turbo-0125', name: 'GPT-3.5 Turbo', desc: 'Quick tasks' }
                          ].map((model) => (
                            <div
                              key={model.value}
                              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                llmConfig.model === model.value
                                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                                  : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                              }`}
                              onClick={() => switchModel({ ...llmConfig, model: model.value })}
                            >
                              <div className='flex items-start justify-between gap-2'>
                                <div className='min-w-0 flex-1'>
                                  <div className='font-medium text-sm truncate'>{model.name}</div>
                                  <div className='text-xs text-muted-foreground truncate'>{model.desc}</div>
                                </div>
                                {model.badge && (
                                  <Badge variant="secondary" className='text-xs flex-shrink-0'>{model.badge}</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          {[
                            { value: 'models/gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro', desc: 'Most intelligent', badge: 'New' },
                            { value: 'models/gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', desc: 'Best performance', badge: 'New' },
                            { value: 'models/gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: 'Fast & capable' }
                          ].map((model) => (
                            <div
                              key={model.value}
                              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                llmConfig.model === model.value
                                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                                  : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                              }`}
                              onClick={() => switchModel({ ...llmConfig, model: model.value })}
                            >
                              <div className='flex items-start justify-between gap-2'>
                                <div className='min-w-0 flex-1'>
                                  <div className='font-medium text-sm truncate'>{model.name}</div>
                                  <div className='text-xs text-muted-foreground truncate'>{model.desc}</div>
                                </div>
                                {model.badge && (
                                  <Badge variant="secondary" className='text-xs flex-shrink-0'>{model.badge}</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Behavior Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    Behavior Settings
                    <div className="flex gap-1">
                      {['Precise', 'Balanced', 'Creative'].map((preset) => (
                        <Button
                          key={preset}
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            const presetValues = {
                              'Precise': { temperature: 0, maxTokens: 1000 },
                              'Balanced': { temperature: 0.5, maxTokens: 2000 },
                              'Creative': { temperature: 0.8, maxTokens: 3000 }
                            };
                            switchModel({ ...llmConfig, ...presetValues[preset as keyof typeof presetValues] });
                          }}
                        >
                          {preset}
                        </Button>
                      ))}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-6'>
                  {/* Temperature Control */}
                  <div>
                    <div className='flex justify-between items-center mb-3'>
                      <Label htmlFor='temperature' className='text-sm font-medium flex items-center gap-2'>
                        <div className='flex items-center gap-1'>
                          <div className={`w-3 h-3 rounded-full ${
                            llmConfig.temperature <= 0.3 ? 'bg-blue-500' :
                            llmConfig.temperature <= 0.7 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}></div>
                          {t('playground.config.model.temperature')}
                        </div>
                      </Label>
                      <div className="flex items-center gap-2">
                        <span className='text-sm font-mono bg-muted px-2 py-1 rounded'>
                          {llmConfig.temperature}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {llmConfig.temperature <= 0.3 ? 'Precise' :
                           llmConfig.temperature <= 0.7 ? 'Balanced' : 'Creative'}
                        </div>
                      </div>
                    </div>
                    <Input
                      id='temperature'
                      type='range'
                      min='0'
                      max='1'
                      step='0.1'
                      value={llmConfig.temperature}
                      onChange={(e) =>
                        switchModel({
                          ...llmConfig,
                          temperature: parseFloat(e.target.value),
                        })
                      }
                      className='mt-1.5'
                    />
                    <div className='flex justify-between text-xs text-muted-foreground mt-2'>
                      <span>🎯 {t('playground.config.model.temperatureHints.precise')}</span>
                      <span>🎨 {t('playground.config.model.temperatureHints.creative')}</span>
                    </div>
                  </div>

                  {/* Max Tokens Control */}
                  <div>
                    <div className='flex justify-between items-center mb-3'>
                      <Label htmlFor='maxTokens' className='text-sm font-medium'>
                        {t('playground.config.model.maxTokens')}
                      </Label>
                      <div className="flex items-center gap-2">
                        <span className='text-sm font-mono bg-muted px-2 py-1 rounded'>
                          {llmConfig.maxTokens}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          ~{Math.round(llmConfig.maxTokens * 0.75)} words
                        </div>
                      </div>
                    </div>
                    <Input
                      id='maxTokens'
                      type='range'
                      min='100'
                      max='4000'
                      step='100'
                      value={llmConfig.maxTokens}
                      onChange={(e) =>
                        switchModel({
                          ...llmConfig,
                          maxTokens: parseInt(e.target.value),
                        })
                      }
                      className='mt-1.5'
                    />
                    <div className='flex justify-between text-xs text-muted-foreground mt-2'>
                      <span>Short (100)</span>
                      <span>Long (4000)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Advanced Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Advanced Settings</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
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
                        <SelectItem value='debug'>{t('playground.logLevels.debug')}</SelectItem>
                        <SelectItem value='info'>{t('playground.logLevels.info')}</SelectItem>
                        <SelectItem value='warn'>{t('playground.logLevels.warn')}</SelectItem>
                        <SelectItem value='error'>{t('playground.logLevels.error')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* RAG Configuration */}
                  <div className='flex items-center justify-between'>
                    <div>
                      <Label htmlFor='ragEnabled' className='text-sm font-medium'>
                        Enable RAG
                      </Label>
                      <p className='text-xs text-muted-foreground mt-1'>
                        Use your uploaded documents for context
                      </p>
                    </div>
                    <Switch
                      id='ragEnabled'
                      checked={llmConfig.ragEnabled || false}
                      onCheckedChange={(checked) => {
                        setLlmConfig({
                          ...llmConfig,
                          ragEnabled: checked,
                        });
                      }}
                      disabled={isSessionActive}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value='logs' className='flex-1 mt-4 overflow-y-auto pr-2'>
            <div className='space-y-4'>
              <div className='flex items-center justify-between mb-2'>
                <div>
                  <Label className='text-sm font-medium mb-1 block sr-only'> {/* Hide label visually, keep for accessibility */}
                    {t('playground.config.model.logLevel')}
                  </Label>
                  <Select
                    value={logLevel}
                    onValueChange={handleLogLevelChange}
                    disabled={isSessionActive}>
                    <SelectTrigger className='w-40'> {/* Restored width */}
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

              <div className="h-[calc(100vh-25rem)] rounded-md border">
                {serverLogs.length === 0 && clientLogs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    {t('playground.logs.empty')}
                  </div>
                ) : (
                  <div 
                    className="h-full overflow-auto" 
                    onScroll={(e) => {
                      e.stopPropagation();
                    }}
                    data-user-scroll="true"
                  >
                    <div className="space-y-0.5 p-2">
                      {(() => {
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
                        
                        const truncateText = (text: string, maxLength = 200) => {
                          if (!text) return '';
                          if (text.length <= maxLength) return text;
                          return text.substring(0, maxLength) + '...';
                        };
                        
                        const isLikelyBinary = (text: string) => {
                          return text.length > 500 && !text.includes('\n') && /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/.test(text);
                        };
                        
                        return allLogs.map((log, index) => {
                          const time = log.timestamp.toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit' 
                          });
                          
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
                          
                          let cleanedMessage = log.message;
                          
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
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
