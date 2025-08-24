'use client';

import { CheckCircle, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { EmbeddedChat } from '@/types/embedded-chat';

interface EmbedCodeTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function EmbedCodeTab({ chat, chatUuid }: EmbedCodeTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.host}`
    : 'https://plugged.in';

  const simpleEmbedCode = `<script src="${baseUrl}/api/widget?chatId=${chatUuid}${chat.require_api_key && chat.api_key ? `&key=${chat.api_key}` : ''}"></script>`;

  const customEmbedCode = `<!-- Plugged.in Embedded Chat -->
<script>
  (function() {
    var script = document.createElement('script');
    script.src = '${baseUrl}/api/widget?chatId=${chatUuid}${chat.require_api_key && chat.api_key ? `&key=${chat.api_key}` : ''}';
    script.async = true;
    script.dataset.position = '${chat.position}';
    document.head.appendChild(script);
  })();
</script>`;

  const reactCode = `import { useEffect } from 'react';

export function PluggedinChat() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '${baseUrl}/api/widget?chatId=${chatUuid}${chat.require_api_key && chat.api_key ? `&key=${chat.api_key}` : ''}';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup if needed
      if (window.PluggedinChat) {
        window.PluggedinChat.destroy();
      }
      document.body.removeChild(script);
    };
  }, []);

  return null;
}`;

  const copyCode = (code: string, type: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(type);
    toast({
      title: t('common.success'),
      description: t('embeddedChat.embed.copySuccess', 'Code copied to clipboard'),
    });
    
    setTimeout(() => setCopiedCode(null), 3000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('embeddedChat.embed.title', 'Embed Code')}</CardTitle>
          <CardDescription>
            {t('embeddedChat.embed.description', 'Copy and paste this code into your website')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="simple" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="simple">{t('embeddedChat.embed.simple', 'Simple')}</TabsTrigger>
              <TabsTrigger value="custom">{t('embeddedChat.embed.custom', 'Custom')}</TabsTrigger>
              <TabsTrigger value="react">{t('embeddedChat.embed.react', 'React')}</TabsTrigger>
            </TabsList>

            <TabsContent value="simple" className="space-y-4">
              <div>
                <Label>{t('embeddedChat.embed.simpleDescription', 'Add this script tag to your HTML')}</Label>
                <div className="mt-2 relative">
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto">
                    <code className="text-sm">{simpleEmbedCode}</code>
                  </pre>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => copyCode(simpleEmbedCode, 'simple')}
                  >
                    {copiedCode === 'simple' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4">
              <div>
                <Label>{t('embeddedChat.embed.customDescription', 'Advanced embed with configuration options')}</Label>
                <div className="mt-2 relative">
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto">
                    <code className="text-sm">{customEmbedCode}</code>
                  </pre>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => copyCode(customEmbedCode, 'custom')}
                  >
                    {copiedCode === 'custom' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="react" className="space-y-4">
              <div>
                <Label>{t('embeddedChat.embed.reactDescription', 'React component implementation')}</Label>
                <div className="mt-2 relative">
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto">
                    <code className="text-sm">{reactCode}</code>
                  </pre>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => copyCode(reactCode, 'react')}
                  >
                    {copiedCode === 'react' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('embeddedChat.embed.requirementsTitle', 'Requirements')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">{t('embeddedChat.embed.domainWhitelist', 'Domain Whitelist')}</h4>
            {chat.allowed_domains.length > 0 ? (
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                {chat.allowed_domains.map((domain, index) => (
                  <li key={index}>{domain}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('embeddedChat.embed.allDomainsAllowed', 'All domains are allowed')}
              </p>
            )}
          </div>

          {chat.require_api_key && (
            <div className="space-y-2">
              <h4 className="font-medium">{t('embeddedChat.embed.apiKeyRequired', 'API Key Required')}</h4>
              <p className="text-sm text-muted-foreground">
                {chat.api_key 
                  ? t('embeddedChat.embed.apiKeyIncluded', 'The API key is included in the embed code above')
                  : t('embeddedChat.embed.apiKeyNeeded', 'Generate an API key in the API Keys tab first')
                }
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-medium">{t('embeddedChat.embed.status', 'Status')}</h4>
            <p className="text-sm text-muted-foreground">
              {chat.is_active 
                ? t('embeddedChat.embed.statusActive', '✅ Chat is active and ready to use')
                : t('embeddedChat.embed.statusInactive', '❌ Chat is inactive - enable it in General settings')
              }
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('embeddedChat.embed.customizationTitle', 'Customization')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">{t('embeddedChat.embed.position', 'Position')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('embeddedChat.embed.currentPosition', 'Current position')}: <code className="px-2 py-1 bg-muted rounded">{chat.position}</code>
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">{t('embeddedChat.embed.styling', 'Styling')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('embeddedChat.embed.stylingDescription', 'The chat widget will automatically adapt to your website\'s theme. You can customize colors and styling in the Appearance tab.')}
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">{t('embeddedChat.embed.events', 'JavaScript API')}</h4>
            <pre className="p-3 bg-muted rounded-lg text-sm">
              <code>{`// Open chat programmatically
window.PluggedinChat.open();

// Close chat
window.PluggedinChat.close();

// Listen for events
window.addEventListener('pluggedin:chat:opened', () => {
  console.log('Chat opened');
});`}</code>
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}