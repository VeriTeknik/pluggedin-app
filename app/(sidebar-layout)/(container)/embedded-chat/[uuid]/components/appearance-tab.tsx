'use client';

import { Eye,Monitor, Palette, Settings, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateEmbeddedChatConfig } from '@/app/actions/embedded-chat';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { EmbeddedChat } from '@/types/embedded-chat';

interface AppearanceTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

interface AppearanceConfig {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center';
  theme: {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
    borderRadius: number;
    fontSize: number;
    fontFamily: string;
  };
  dimensions: {
    width: number;
    height: number;
    minimizedSize: number;
  };
  behavior: {
    autoOpen: boolean;
    showWelcome: boolean;
    enableNotifications: boolean;
    showTypingIndicator: boolean;
    enableSounds: boolean;
  };
  branding: {
    showPoweredBy: boolean;
    customLogo?: string;
    customTitle?: string;
  };
}

const POSITION_OPTIONS = [
  { value: 'bottom-right', label: 'Bottom Right', icon: '↘️' },
  { value: 'bottom-left', label: 'Bottom Left', icon: '↙️' },
  { value: 'top-right', label: 'Top Right', icon: '↗️' },
  { value: 'top-left', label: 'Top Left', icon: '↖️' },
  { value: 'bottom-center', label: 'Bottom Center', icon: '⬇️' },
];

const FONT_FAMILIES = [
  { value: 'system-ui, sans-serif', label: 'System Default' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: 'Open Sans, sans-serif', label: 'Open Sans' },
  { value: 'Lato, sans-serif', label: 'Lato' },
  { value: 'Poppins, sans-serif', label: 'Poppins' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat' },
];

const PRESET_THEMES = [
  {
    name: 'Default Blue',
    colors: {
      primaryColor: '#3b82f6',
      secondaryColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      textColor: '#111827',
    }
  },
  {
    name: 'Professional',
    colors: {
      primaryColor: '#1f2937',
      secondaryColor: '#f3f4f6',
      backgroundColor: '#ffffff',
      textColor: '#374151',
    }
  },
  {
    name: 'Green Nature',
    colors: {
      primaryColor: '#10b981',
      secondaryColor: '#d1fae5',
      backgroundColor: '#ffffff',
      textColor: '#065f46',
    }
  },
  {
    name: 'Purple Modern',
    colors: {
      primaryColor: '#8b5cf6',
      secondaryColor: '#ede9fe',
      backgroundColor: '#ffffff',
      textColor: '#581c87',
    }
  },
  {
    name: 'Dark Mode',
    colors: {
      primaryColor: '#60a5fa',
      secondaryColor: '#374151',
      backgroundColor: '#1f2937',
      textColor: '#f9fafb',
    }
  },
];

export function AppearanceTab({ chat, chatUuid }: AppearanceTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Initialize appearance config with defaults from theme_config
  const themeConfig = (chat.theme_config as any) || {};
  const [appearanceConfig, setAppearanceConfig] = useState<AppearanceConfig>({
    position: (chat.position as any) || 'bottom-right',
    theme: {
      primaryColor: themeConfig.theme?.primaryColor || themeConfig.primaryColor || '#3b82f6',
      secondaryColor: themeConfig.theme?.secondaryColor || themeConfig.secondaryColor || '#e5e7eb',
      backgroundColor: themeConfig.theme?.backgroundColor || themeConfig.backgroundColor || '#ffffff',
      textColor: themeConfig.theme?.textColor || themeConfig.textColor || '#111827',
      borderRadius: themeConfig.theme?.borderRadius || themeConfig.borderRadius || 12,
      fontSize: themeConfig.theme?.fontSize || themeConfig.fontSize || 14,
      fontFamily: themeConfig.theme?.fontFamily || themeConfig.fontFamily || 'system-ui, sans-serif',
    },
    dimensions: {
      width: themeConfig.dimensions?.width || themeConfig.width || 380,
      height: themeConfig.dimensions?.height || themeConfig.height || 600,
      minimizedSize: themeConfig.dimensions?.minimizedSize || themeConfig.minimizedSize || 60,
    },
    behavior: {
      autoOpen: themeConfig.behavior?.autoOpen || themeConfig.autoOpen || false,
      showWelcome: themeConfig.behavior?.showWelcome ?? themeConfig.showWelcome ?? true,
      enableNotifications: themeConfig.behavior?.enableNotifications ?? themeConfig.enableNotifications ?? true,
      showTypingIndicator: themeConfig.behavior?.showTypingIndicator ?? themeConfig.showTypingIndicator ?? true,
      enableSounds: themeConfig.behavior?.enableSounds || themeConfig.enableSounds || false,
    },
    branding: {
      showPoweredBy: themeConfig.branding?.showPoweredBy ?? themeConfig.showPoweredBy ?? true,
      customLogo: themeConfig.branding?.customLogo || themeConfig.customLogo || '',
      customTitle: themeConfig.branding?.customTitle || themeConfig.customTitle || '',
    },
  });

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const result = await updateEmbeddedChatConfig(chatUuid, {
        position: appearanceConfig.position,
        theme: appearanceConfig.theme,
        dimensions: appearanceConfig.dimensions,
        behavior: appearanceConfig.behavior,
        branding: appearanceConfig.branding,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save appearance settings');
      }

      toast({
        title: t('common.success'),
        description: t('embeddedChat.appearance.saveSuccess', 'Appearance settings saved successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to save appearance settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const applyPresetTheme = (preset: typeof PRESET_THEMES[0]) => {
    setAppearanceConfig({
      ...appearanceConfig,
      theme: {
        ...appearanceConfig.theme,
        ...preset.colors,
      },
    });
  };

  const updateTheme = (key: keyof AppearanceConfig['theme'], value: any) => {
    setAppearanceConfig({
      ...appearanceConfig,
      theme: {
        ...appearanceConfig.theme,
        [key]: value,
      },
    });
  };

  const updateDimensions = (key: keyof AppearanceConfig['dimensions'], value: number) => {
    setAppearanceConfig({
      ...appearanceConfig,
      dimensions: {
        ...appearanceConfig.dimensions,
        [key]: value,
      },
    });
  };

  const updateBehavior = (key: keyof AppearanceConfig['behavior'], value: any) => {
    setAppearanceConfig({
      ...appearanceConfig,
      behavior: {
        ...appearanceConfig.behavior,
        [key]: value,
      },
    });
  };

  const updateBranding = (key: keyof AppearanceConfig['branding'], value: any) => {
    setAppearanceConfig({
      ...appearanceConfig,
      branding: {
        ...appearanceConfig.branding,
        [key]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t('embeddedChat.appearance.title', 'Widget Appearance')}
          </CardTitle>
          <CardDescription>
            {t('embeddedChat.appearance.description', 'Customize how your chat widget looks and behaves on websites')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="theme" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="theme" className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                {t('embeddedChat.appearance.theme', 'Theme')}
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                {t('embeddedChat.appearance.layout', 'Layout')}
              </TabsTrigger>
              <TabsTrigger value="behavior" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('embeddedChat.appearance.behavior', 'Behavior')}
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {t('embeddedChat.appearance.preview', 'Preview')}
              </TabsTrigger>
            </TabsList>

            {/* Theme Tab */}
            <TabsContent value="theme" className="space-y-6">
              {/* Preset Themes */}
              <div>
                <Label className="text-base font-semibold mb-3 block">
                  {t('embeddedChat.appearance.presetThemes', 'Preset Themes')}
                </Label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {PRESET_THEMES.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => applyPresetTheme(preset)}
                      className="p-3 border rounded-lg hover:border-primary transition-colors text-left"
                    >
                      <div className="flex gap-1 mb-2">
                        <div 
                          className="w-4 h-4 rounded-full border" 
                          style={{ backgroundColor: preset.colors.primaryColor }}
                        />
                        <div 
                          className="w-4 h-4 rounded-full border" 
                          style={{ backgroundColor: preset.colors.secondaryColor }}
                        />
                        <div 
                          className="w-4 h-4 rounded-full border" 
                          style={{ backgroundColor: preset.colors.backgroundColor }}
                        />
                      </div>
                      <div className="text-sm font-medium">{preset.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Colors */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="primaryColor">
                    {t('embeddedChat.appearance.primaryColor', 'Primary Color')}
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={appearanceConfig.theme.primaryColor}
                      onChange={(e) => updateTheme('primaryColor', e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={appearanceConfig.theme.primaryColor}
                      onChange={(e) => updateTheme('primaryColor', e.target.value)}
                      placeholder="#3b82f6"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="backgroundColor">
                    {t('embeddedChat.appearance.backgroundColor', 'Background Color')}
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="backgroundColor"
                      type="color"
                      value={appearanceConfig.theme.backgroundColor}
                      onChange={(e) => updateTheme('backgroundColor', e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={appearanceConfig.theme.backgroundColor}
                      onChange={(e) => updateTheme('backgroundColor', e.target.value)}
                      placeholder="#ffffff"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="textColor">
                    {t('embeddedChat.appearance.textColor', 'Text Color')}
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="textColor"
                      type="color"
                      value={appearanceConfig.theme.textColor}
                      onChange={(e) => updateTheme('textColor', e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={appearanceConfig.theme.textColor}
                      onChange={(e) => updateTheme('textColor', e.target.value)}
                      placeholder="#111827"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="secondaryColor">
                    {t('embeddedChat.appearance.secondaryColor', 'Secondary Color')}
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="secondaryColor"
                      type="color"
                      value={appearanceConfig.theme.secondaryColor}
                      onChange={(e) => updateTheme('secondaryColor', e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={appearanceConfig.theme.secondaryColor}
                      onChange={(e) => updateTheme('secondaryColor', e.target.value)}
                      placeholder="#e5e7eb"
                    />
                  </div>
                </div>
              </div>

              {/* Typography */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">
                  {t('embeddedChat.appearance.typography', 'Typography')}
                </Label>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fontFamily">
                      {t('embeddedChat.appearance.fontFamily', 'Font Family')}
                    </Label>
                    <Select
                      value={appearanceConfig.theme.fontFamily}
                      onValueChange={(value) => updateTheme('fontFamily', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_FAMILIES.map((font) => (
                          <SelectItem key={font.value} value={font.value}>
                            {font.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="fontSize">
                      {t('embeddedChat.appearance.fontSize', 'Font Size')} ({appearanceConfig.theme.fontSize}px)
                    </Label>
                    <Slider
                      value={[appearanceConfig.theme.fontSize]}
                      onValueChange={([value]) => updateTheme('fontSize', value)}
                      min={12}
                      max={18}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="borderRadius">
                    {t('embeddedChat.appearance.borderRadius', 'Border Radius')} ({appearanceConfig.theme.borderRadius}px)
                  </Label>
                  <Slider
                    value={[appearanceConfig.theme.borderRadius]}
                    onValueChange={([value]) => updateTheme('borderRadius', value)}
                    min={0}
                    max={20}
                    step={1}
                    className="mt-2"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Layout Tab */}
            <TabsContent value="layout" className="space-y-6">
              {/* Position */}
              <div>
                <Label className="text-base font-semibold mb-3 block">
                  {t('embeddedChat.appearance.position', 'Widget Position')}
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  {POSITION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setAppearanceConfig({
                        ...appearanceConfig,
                        position: option.value as any,
                      })}
                      className={`p-4 border rounded-lg text-center transition-colors ${
                        appearanceConfig.position === option.value
                          ? 'border-primary bg-primary/10'
                          : 'hover:border-primary/50'
                      }`}
                    >
                      <div className="text-2xl mb-2">{option.icon}</div>
                      <div className="text-sm font-medium">{option.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dimensions */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">
                  {t('embeddedChat.appearance.dimensions', 'Dimensions')}
                </Label>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="width">
                      {t('embeddedChat.appearance.width', 'Width')} ({appearanceConfig.dimensions.width}px)
                    </Label>
                    <Slider
                      value={[appearanceConfig.dimensions.width]}
                      onValueChange={([value]) => updateDimensions('width', value)}
                      min={300}
                      max={500}
                      step={10}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="height">
                      {t('embeddedChat.appearance.height', 'Height')} ({appearanceConfig.dimensions.height}px)
                    </Label>
                    <Slider
                      value={[appearanceConfig.dimensions.height]}
                      onValueChange={([value]) => updateDimensions('height', value)}
                      min={400}
                      max={800}
                      step={10}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="minimizedSize">
                    {t('embeddedChat.appearance.minimizedSize', 'Button Size')} ({appearanceConfig.dimensions.minimizedSize}px)
                  </Label>
                  <Slider
                    value={[appearanceConfig.dimensions.minimizedSize]}
                    onValueChange={([value]) => updateDimensions('minimizedSize', value)}
                    min={50}
                    max={80}
                    step={5}
                    className="mt-2"
                  />
                </div>
              </div>

              {/* Mobile Responsiveness */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="h-4 w-4" />
                  <Label className="font-medium">
                    {t('embeddedChat.appearance.mobileResponsive', 'Mobile Responsive')}
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('embeddedChat.appearance.mobileNote', 
                    'On mobile devices, the chat will automatically adjust to use full screen for better usability.')}
                </p>
              </div>
            </TabsContent>

            {/* Behavior Tab */}
            <TabsContent value="behavior" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label className="font-medium">
                      {t('embeddedChat.appearance.autoOpen', 'Auto Open')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('embeddedChat.appearance.autoOpenDesc', 'Automatically open chat when page loads')}
                    </p>
                  </div>
                  <Switch
                    checked={appearanceConfig.behavior.autoOpen}
                    onCheckedChange={(checked) => updateBehavior('autoOpen', checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label className="font-medium">
                      {t('embeddedChat.appearance.showWelcome', 'Show Welcome Message')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('embeddedChat.appearance.showWelcomeDesc', 'Display welcome message when chat opens')}
                    </p>
                  </div>
                  <Switch
                    checked={appearanceConfig.behavior.showWelcome}
                    onCheckedChange={(checked) => updateBehavior('showWelcome', checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label className="font-medium">
                      {t('embeddedChat.appearance.enableNotifications', 'Browser Notifications')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('embeddedChat.appearance.enableNotificationsDesc', 'Show browser notifications for new messages')}
                    </p>
                  </div>
                  <Switch
                    checked={appearanceConfig.behavior.enableNotifications}
                    onCheckedChange={(checked) => updateBehavior('enableNotifications', checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label className="font-medium">
                      {t('embeddedChat.appearance.showTypingIndicator', 'Typing Indicator')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('embeddedChat.appearance.showTypingIndicatorDesc', 'Show when AI is typing a response')}
                    </p>
                  </div>
                  <Switch
                    checked={appearanceConfig.behavior.showTypingIndicator}
                    onCheckedChange={(checked) => updateBehavior('showTypingIndicator', checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label className="font-medium">
                      {t('embeddedChat.appearance.enableSounds', 'Sound Effects')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('embeddedChat.appearance.enableSoundsDesc', 'Play sounds for new messages and notifications')}
                    </p>
                  </div>
                  <Switch
                    checked={appearanceConfig.behavior.enableSounds}
                    onCheckedChange={(checked) => updateBehavior('enableSounds', checked)}
                  />
                </div>
              </div>

              {/* Branding */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">
                  {t('embeddedChat.appearance.branding', 'Branding')}
                </Label>

                <div>
                  <Label htmlFor="customTitle">
                    {t('embeddedChat.appearance.customTitle', 'Custom Title')}
                  </Label>
                  <Input
                    id="customTitle"
                    value={appearanceConfig.branding.customTitle}
                    onChange={(e) => updateBranding('customTitle', e.target.value)}
                    placeholder="AI Assistant"
                  />
                </div>

                <div>
                  <Label htmlFor="customLogo">
                    {t('embeddedChat.appearance.customLogo', 'Custom Logo URL')}
                  </Label>
                  <Input
                    id="customLogo"
                    value={appearanceConfig.branding.customLogo}
                    onChange={(e) => updateBranding('customLogo', e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label className="font-medium">
                      {t('embeddedChat.appearance.showPoweredBy', 'Show "Powered by Plugged.in"')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('embeddedChat.appearance.showPoweredByDesc', 'Display attribution link (helps support the project)')}
                    </p>
                  </div>
                  <Switch
                    checked={appearanceConfig.branding.showPoweredBy}
                    onCheckedChange={(checked) => updateBranding('showPoweredBy', checked)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Preview Tab */}
            <TabsContent value="preview" className="space-y-6">
              <div className="text-center">
                <Label className="text-base font-semibold mb-4 block">
                  {t('embeddedChat.appearance.previewTitle', 'Widget Preview')}
                </Label>
                <div 
                  className="relative border-2 border-dashed border-muted-foreground/20 rounded-lg p-8 mx-auto"
                  style={{ 
                    width: '100%', 
                    maxWidth: '800px', 
                    height: '400px',
                    background: 'linear-gradient(45deg, #f8f9fa 25%, transparent 25%), linear-gradient(-45deg, #f8f9fa 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f8f9fa 75%), linear-gradient(-45deg, transparent 75%, #f8f9fa 75%)',
                    backgroundSize: '20px 20px',
                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                  }}
                >
                  {/* Mock Website Content */}
                  <div className="absolute top-4 left-4 right-4">
                    <div className="h-8 bg-gray-200 rounded mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded mb-2 w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded mb-2 w-1/2"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>

                  {/* Mock Chat Widget */}
                  <div 
                    className="absolute shadow-lg rounded-lg"
                    style={{
                      [appearanceConfig.position.includes('right') ? 'right' : 'left']: '20px',
                      bottom: '20px',
                      width: `${Math.min(appearanceConfig.dimensions.width * 0.5, 200)}px`,
                      height: `${Math.min(appearanceConfig.dimensions.height * 0.4, 240)}px`,
                      backgroundColor: appearanceConfig.theme.backgroundColor,
                      color: appearanceConfig.theme.textColor,
                      borderRadius: `${appearanceConfig.theme.borderRadius}px`,
                      fontSize: `${Math.max(appearanceConfig.theme.fontSize * 0.8, 10)}px`,
                      fontFamily: appearanceConfig.theme.fontFamily,
                    }}
                  >
                    {/* Widget Header */}
                    <div 
                      className="p-2 rounded-t-lg"
                      style={{ 
                        backgroundColor: appearanceConfig.theme.primaryColor,
                        color: 'white',
                      }}
                    >
                      <div className="text-xs font-medium">
                        {appearanceConfig.branding.customTitle || 'AI Assistant'}
                      </div>
                    </div>
                    
                    {/* Widget Body */}
                    <div className="p-2 space-y-2">
                      <div 
                        className="text-xs p-2 rounded"
                        style={{ backgroundColor: appearanceConfig.theme.secondaryColor }}
                      >
                        {appearanceConfig.behavior.showWelcome 
                          ? 'Hello! How can I help you today?' 
                          : 'Type your message...'}
                      </div>
                      
                      {/* Mock input */}
                      <div 
                        className="border rounded p-1 text-xs"
                        style={{ 
                          borderColor: appearanceConfig.theme.secondaryColor,
                          minHeight: '20px'
                        }}
                      >
                        Ask me anything...
                      </div>
                    </div>

                    {/* Powered by */}
                    {appearanceConfig.branding.showPoweredBy && (
                      <div className="absolute bottom-1 right-1 text-[8px] opacity-60">
                        Powered by Plugged.in
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground mt-4">
                  {t('embeddedChat.appearance.previewNote', 
                    'This is a scaled-down preview. The actual widget will use the dimensions specified in the Layout tab.')}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? t('common.saving', 'Saving...') : t('common.save', 'Save Changes')}
        </Button>
      </div>
    </div>
  );
}