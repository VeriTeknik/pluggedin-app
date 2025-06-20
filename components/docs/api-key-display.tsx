'use client';

import { Copy, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

interface ApiKeyDisplayProps {
  apiKey?: string;
  placeholder?: string;
  showLoginPrompt?: boolean;
}

export function ApiKeyDisplay({ 
  apiKey, 
  placeholder = '<YOUR_PLUGGEDIN_API_KEY>',
  showLoginPrompt = true 
}: ApiKeyDisplayProps) {
  const { isAuthenticated } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const displayValue = isAuthenticated && apiKey ? apiKey : placeholder;
  const maskedValue = isAuthenticated && apiKey ? 
    `${apiKey.substring(0, 8)}${'•'.repeat(Math.max(0, apiKey.length - 16))}${apiKey.substring(apiKey.length - 8)}` :
    placeholder;

  const handleCopy = () => {
    if (isAuthenticated && apiKey) {
      navigator.clipboard.writeText(apiKey);
      toast({
        description: t('common.copiedToClipboard', 'Copied to clipboard'),
      });
    } else {
      navigator.clipboard.writeText(placeholder);
      toast({
        description: t('docs.placeholderCopied', 'Placeholder copied to clipboard'),
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
        <span className="flex-1">
          {isAuthenticated && apiKey && !isVisible ? maskedValue : displayValue}
        </span>
        <div className="flex gap-1">
          {isAuthenticated && apiKey && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsVisible(!isVisible)}
              title={isVisible ? 'Hide API key' : 'Show API key'}
            >
              {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {!isAuthenticated && showLoginPrompt && (
        <p className="text-sm text-muted-foreground">
          {t('docs.signInForRealKey', 'Sign in to see your actual API key.')}{' '}
          <Link 
            href="/api-keys" 
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            {t('docs.manageApiKeys', 'Manage API Keys')}
          </Link>
        </p>
      )}
    </div>
  );
}