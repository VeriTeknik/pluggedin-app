'use client';

import { ChevronDown, Settings, X, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatHeaderProps {
  currentModel: {
    provider: 'openai' | 'anthropic' | 'google';
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  serverCount: number;
  isSessionActive: boolean;
  onModelSwitch: (provider: string, model: string) => void;
  onOpenSettings: () => void;
  onEndSession: () => void;
  isProcessing: boolean;
}

const PROVIDER_INFO = {
  anthropic: {
    name: 'Anthropic',
    icon: <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-bold">A</div>,
    color: 'from-orange-400 to-orange-600',
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    ]
  },
  openai: {
    name: 'OpenAI',
    icon: <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold">O</div>,
    color: 'from-green-400 to-green-600',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    ]
  },
  google: {
    name: 'Google',
    icon: <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">G</div>,
    color: 'from-blue-400 to-blue-600',
    models: [
      { id: 'models/gemini-1.5-pro-002', name: 'Gemini 1.5 Pro' },
      { id: 'models/gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash' },
    ]
  },
} as const;

const QUICK_MODELS = [
  { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
  { provider: 'openai', model: 'gpt-4o', name: 'GPT-4o' },
  { provider: 'google', model: 'models/gemini-1.5-pro-002', name: 'Gemini 1.5 Pro' },
] as const;

function getModelDisplayName(modelId: string): string {
  // Find in all providers
  for (const provider of Object.values(PROVIDER_INFO)) {
    const model = provider.models.find(m => m.id === modelId);
    if (model) return model.name;
  }
  // Fallback to formatted model ID
  return modelId.replace('models/', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function ChatHeader({
  currentModel,
  serverCount,
  isSessionActive,
  onModelSwitch,
  onOpenSettings,
  onEndSession,
  isProcessing,
}: ChatHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-background/95 backdrop-blur-sm border-b border-border px-4 py-[22px]">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Current Model Info */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Model Provider Info */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0">
              {PROVIDER_INFO[currentModel.provider].icon}
            </div>
            <div className="min-w-0 hidden sm:block">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold truncate">
                  {PROVIDER_INFO[currentModel.provider].name}
                </h2>
                <span className="text-xs font-medium px-1.5 py-0.5 bg-primary/10 text-primary rounded-full truncate">
                  {getModelDisplayName(currentModel.model)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {t('playground.chat.header.temperature')}: {currentModel.temperature || 0} • {t('playground.chat.header.maxTokens')}: {currentModel.maxTokens || 1000}
              </p>
            </div>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className={`w-1.5 h-1.5 rounded-full ${isSessionActive ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-xs text-muted-foreground">
              {serverCount} {serverCount === 1 ? t('playground.chat.header.serverConnected') : t('playground.chat.header.serversConnected')}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Quick Model Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                disabled={isProcessing}
                className="whitespace-nowrap text-xs"
              >
                <Zap className="w-3 h-3 mr-1" />
                {t('playground.chat.header.switchModel')}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {QUICK_MODELS.map((model) => (
                <DropdownMenuItem
                  key={`${model.provider}-${model.model}`}
                  onClick={() => onModelSwitch(model.provider, model.model)}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    {PROVIDER_INFO[model.provider].icon}
                    <span className="font-medium truncate">{model.name}</span>
                  </div>
                  {currentModel.provider === model.provider && currentModel.model === model.model && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenSettings}>
                <Settings className="w-3 h-3 mr-1" />
                {t('playground.chat.header.moreModels')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Stop Session Button */}
          {isSessionActive && (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={onEndSession}
              disabled={isProcessing}
                className="whitespace-nowrap text-xs"
            >
              {isProcessing ? (
                <>
                  <div className="w-3 h-3 mr-1 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t('playground.chat.header.stopping')}
                </>
              ) : (
                <>
                  <X className="w-3 h-3 mr-1" />
                  {t('playground.chat.header.stopSession')}
                </>
              )}
            </Button>
          )}

          {/* Settings Button */}
          <Button variant="ghost" size="sm" onClick={onOpenSettings}>
            <Settings className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
} 