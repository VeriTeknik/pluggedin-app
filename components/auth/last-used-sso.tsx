'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';

interface LastUsedSSO {
  provider: string;
  timestamp: number;
}

export function LastUsedSSO() {
  const { t } = useTranslation();
  const [lastUsed, setLastUsed] = useState<LastUsedSSO | null>(null);
  
  useEffect(() => {
    // Get last used SSO from localStorage
    const stored = localStorage.getItem('last-used-sso');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as LastUsedSSO;
        // Only show if it was used in the last 30 days
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        if (parsed.timestamp > thirtyDaysAgo) {
          setLastUsed(parsed);
        }
      } catch (e) {
        // Invalid data, ignore
      }
    }
  }, []);
  
  if (!lastUsed) return null;
  
  const formatProvider = (provider: string) => {
    const providers: Record<string, string> = {
      github: 'GitHub',
      google: 'Google',
      twitter: 'Twitter',
    };
    return providers[provider] || provider;
  };
  
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };
  
  return (
    <div className="flex justify-center mb-4">
      <Badge variant="secondary" className="text-xs">
        Last signed in with {formatProvider(lastUsed.provider)} • {formatTime(lastUsed.timestamp)}
      </Badge>
    </div>
  );
}