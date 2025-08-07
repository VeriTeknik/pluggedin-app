'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { testEmbeddedChatConfig,updateEmbeddedChatConfig } from '@/app/actions/embedded-chat';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useToast } from '@/hooks/use-toast';
import { EmbeddedChat } from '@/types/embedded-chat';

interface ModelConfigTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function ModelConfigTab({ chat, chatUuid }: ModelConfigTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  
  // Initialize model config with defaults if not set
  const [modelConfig, setModelConfig] = useState({
    provider: chat.model_config?.provider || 'openai',
    model: chat.model_config?.model || 'gpt-4',
    temperature: chat.model_config?.temperature ?? 0.7,
    max_tokens: chat.model_config?.max_tokens ?? 1000,
    top_p: chat.model_config?.top_p ?? 1.0,
    frequency_penalty: chat.model_config?.frequency_penalty ?? 0.0,
    presence_penalty: chat.model_config?.presence_penalty ?? 0.0,
  });

  const handleProviderChange = (provider: string) => {
    // Set default model for provider
    const defaultModels: Record<string, string> = {
      anthropic: 'claude-3-5-sonnet-20240620',
      openai: 'gpt-4',
      google: 'models/gemini-2.0-flash',
      xai: 'grok-1',
    };
    
    setModelConfig({
      ...modelConfig,
      provider: provider as 'anthropic' | 'openai' | 'google' | 'xai',
      model: defaultModels[provider] || '',
    });
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const result = await updateEmbeddedChatConfig(chatUuid, {
        model_config: modelConfig,
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update model configuration');
      }

      toast({
        title: t('common.success'),
        description: t('embeddedChat.model.saveSuccess', 'Model configuration saved successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to save model configuration',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testEmbeddedChatConfig(chatUuid, 'Hello, can you help me?');
      
      if (!result.success) {
        throw new Error(result.error || 'Test failed');
      }

      setTestResult(result.data?.response || 'Test completed successfully');
    } catch (error) {
      setTestResult(`Error: ${error instanceof Error ? error.message : 'Test failed'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handlePreset = (preset: 'Precise' | 'Balanced' | 'Creative') => {
    const presetValues = {
      'Precise': { temperature: 0, max_tokens: 1000 },
      'Balanced': { temperature: 0.5, max_tokens: 2000 },
      'Creative': { temperature: 0.8, max_tokens: 3000 }
    };
    
    setModelConfig({
      ...modelConfig,
      temperature: presetValues[preset].temperature,
      max_tokens: presetValues[preset].max_tokens,
    });
  };

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle>{t('embeddedChat.model.provider', 'AI Provider')}</CardTitle>
          <CardDescription>
            {t('embeddedChat.model.providerDescription', 'Choose the AI service provider for your chat')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Anthropic Card */}
            <div 
              className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
                modelConfig.provider === 'anthropic' 
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                  : 'border-muted hover:bg-muted/50'
              }`}
              onClick={() => handleProviderChange('anthropic')}
            >
              {modelConfig.provider === 'anthropic' && (
                <div className="absolute top-2 right-2">
                  <div className="h-3 w-3 rounded-full bg-primary"></div>
                </div>
              )}
              <div className="text-center space-y-2">
                <div className="w-10 h-10 mx-auto bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">A</span>
                </div>
                <div className="font-medium">Anthropic</div>
                <div className="text-xs text-muted-foreground">Claude Models</div>
              </div>
            </div>

            {/* OpenAI Card */}
            <div 
              className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
                modelConfig.provider === 'openai' 
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                  : 'border-muted hover:bg-muted/50'
              }`}
              onClick={() => handleProviderChange('openai')}
            >
              {modelConfig.provider === 'openai' && (
                <div className="absolute top-2 right-2">
                  <div className="h-3 w-3 rounded-full bg-primary"></div>
                </div>
              )}
              <div className="text-center space-y-2">
                <div className="w-10 h-10 mx-auto bg-gradient-to-br from-green-500 to-teal-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">O</span>
                </div>
                <div className="font-medium">OpenAI</div>
                <div className="text-xs text-muted-foreground">GPT Models</div>
              </div>
            </div>

            {/* Google Card */}
            <div 
              className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
                modelConfig.provider === 'google' 
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                  : 'border-muted hover:bg-muted/50'
              }`}
              onClick={() => handleProviderChange('google')}
            >
              {modelConfig.provider === 'google' && (
                <div className="absolute top-2 right-2">
                  <div className="h-3 w-3 rounded-full bg-primary"></div>
                </div>
              )}
              <div className="text-center space-y-2">
                <div className="w-10 h-10 mx-auto bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">G</span>
                </div>
                <div className="font-medium">Google</div>
                <div className="text-xs text-muted-foreground">Gemini Models</div>
              </div>
            </div>

            {/* xAI Card */}
            <div 
              className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
                modelConfig.provider === 'xai' 
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                  : 'border-muted hover:bg-muted/50'
              }`}
              onClick={() => handleProviderChange('xai')}
            >
              {modelConfig.provider === 'xai' && (
                <div className="absolute top-2 right-2">
                  <div className="h-3 w-3 rounded-full bg-primary"></div>
                </div>
              )}
              <div className="text-center space-y-2">
                <div className="w-10 h-10 mx-auto bg-gradient-to-br from-gray-600 to-black rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">X</span>
                </div>
                <div className="font-medium">xAI</div>
                <div className="text-xs text-muted-foreground">Grok Models</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle>{t('embeddedChat.model.modelSelection', 'Model Selection')}</CardTitle>
          <CardDescription>
            {t('embeddedChat.model.modelSelectionDescription', 'Choose the specific model to use')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {modelConfig.provider === 'anthropic' && (
              <>
                {[
                  { value: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', desc: 'Fast & capable' },
                  { value: 'claude-3-opus-20240229', name: 'Claude 3 Opus', desc: 'Most powerful' },
                  { value: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', desc: 'Quick responses' }
                ].map((model) => (
                  <div
                    key={model.value}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      modelConfig.model === model.value
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                        : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                    }`}
                    onClick={() => setModelConfig({ ...modelConfig, model: model.value })}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-muted-foreground">{model.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            
            {modelConfig.provider === 'openai' && (
              <>
                {[
                  { value: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo', desc: 'Most capable' },
                  { value: 'gpt-4', name: 'GPT-4', desc: 'High intelligence' },
                  { value: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', desc: 'Fast & affordable' }
                ].map((model) => (
                  <div
                    key={model.value}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      modelConfig.model === model.value
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                        : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                    }`}
                    onClick={() => setModelConfig({ ...modelConfig, model: model.value })}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-muted-foreground">{model.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            
            {modelConfig.provider === 'google' && (
              <>
                {[
                  { value: 'models/gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: 'Fast & capable' },
                  { value: 'models/gemini-pro', name: 'Gemini Pro', desc: 'Balanced performance' }
                ].map((model) => (
                  <div
                    key={model.value}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      modelConfig.model === model.value
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                        : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                    }`}
                    onClick={() => setModelConfig({ ...modelConfig, model: model.value })}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-muted-foreground">{model.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            
            {modelConfig.provider === 'xai' && (
              <div className="col-span-2">
                <Alert>
                  <AlertDescription>
                    {t('embeddedChat.model.xaiNote', 'xAI integration is coming soon. Please select another provider.')}
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Behavior Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('embeddedChat.model.behaviorSettings', 'Behavior Settings')}</CardTitle>
            <div className="flex gap-1">
              {['Precise', 'Balanced', 'Creative'].map((preset) => (
                <Button
                  key={preset}
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handlePreset(preset as 'Precise' | 'Balanced' | 'Creative')}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>
          <CardDescription>
            {t('embeddedChat.model.behaviorDescription', 'Fine-tune how the AI responds')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Temperature Control */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <Label className="text-sm font-medium">
                {t('embeddedChat.model.temperature', 'Temperature')}
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {modelConfig.temperature}
                </span>
                <span className="text-xs text-muted-foreground">
                  {modelConfig.temperature <= 0.3 ? 'Precise' :
                   modelConfig.temperature <= 0.7 ? 'Balanced' : 'Creative'}
                </span>
              </div>
            </div>
            <Input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={modelConfig.temperature}
              onChange={(e) => setModelConfig({
                ...modelConfig,
                temperature: parseFloat(e.target.value),
              })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{t('embeddedChat.model.precise', 'Precise')}</span>
              <span>{t('embeddedChat.model.creative', 'Creative')}</span>
            </div>
          </div>

          {/* Max Tokens Control */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <Label className="text-sm font-medium">
                {t('embeddedChat.model.maxTokens', 'Max Tokens')}
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {modelConfig.max_tokens}
                </span>
                <span className="text-xs text-muted-foreground">
                  ~{Math.round(modelConfig.max_tokens * 0.75)} words
                </span>
              </div>
            </div>
            <Input
              type="range"
              min="100"
              max="4000"
              step="100"
              value={modelConfig.max_tokens}
              onChange={(e) => setModelConfig({
                ...modelConfig,
                max_tokens: parseInt(e.target.value),
              })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>Short (100)</span>
              <span>Long (4000)</span>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {t('embeddedChat.model.topP', 'Top P')}
              </Label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={modelConfig.top_p}
                onChange={(e) => setModelConfig({
                  ...modelConfig,
                  top_p: parseFloat(e.target.value),
                })}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {t('embeddedChat.model.frequencyPenalty', 'Frequency Penalty')}
              </Label>
              <Input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={modelConfig.frequency_penalty}
                onChange={(e) => setModelConfig({
                  ...modelConfig,
                  frequency_penalty: parseFloat(e.target.value),
                })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>{t('embeddedChat.model.testConfiguration', 'Test Configuration')}</CardTitle>
          <CardDescription>
            {t('embeddedChat.model.testDescription', 'Test your model configuration with a sample message')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={handleTest}
              disabled={isTesting}
              variant="secondary"
            >
              {isTesting ? t('embeddedChat.model.testing', 'Testing...') : t('embeddedChat.model.test', 'Test Configuration')}
            </Button>
            <Button 
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? t('common.saving') : t('common.saveChanges')}
            </Button>
          </div>
          
          {testResult && (
            <Alert>
              <AlertDescription className="whitespace-pre-wrap">
                {testResult}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}