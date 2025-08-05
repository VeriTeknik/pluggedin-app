'use client';

import { Globe } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { useLanguage } from '@/hooks/use-language';
import { useMounted } from '@/hooks/use-mounted';
import { type Locale, localeNames } from '@/i18n/config';

import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

const languageFlags: Record<Locale, string> = {
  en: '🇬🇧',
  tr: '🇹🇷',
  nl: '🇳🇱',
  zh: '🇨🇳',
  ja: '🇯🇵',
  hi: '🇮🇳'
};

export function LanguageSwitcher() {
  const { currentLanguage, setLanguage } = useLanguage();
  const mounted = useMounted();
  const pathname = usePathname();

  // Check if we're on a chat page using specific patterns
  const isOnChatPage = useMemo(() => {
    try {
      // Match /to/username/slug or /to/username/chat/uuid patterns
      const publicChatPattern = /^\/to\/[^\/]+\/(chat\/[^\/]+|[^\/]+)$/;
      return publicChatPattern.test(pathname);
    } catch (error) {
      console.warn('Error detecting chat page:', error);
      return false;
    }
  }, [pathname]);

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  return (
    <div className={`fixed z-50 ${isOnChatPage ? 'bottom-20 right-4' : 'bottom-4 right-4'}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 p-0"
            aria-label="Change language"
          >
            <Globe className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(Object.keys(localeNames) as Locale[]).map((locale) => (
            <DropdownMenuItem
              key={locale}
              onClick={() => setLanguage(locale)}
              className={currentLanguage === locale ? 'bg-accent' : ''}
            >
              <span className="mr-2">{languageFlags[locale]}</span>
              {localeNames[locale]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
