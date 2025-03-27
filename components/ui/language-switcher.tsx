'use client';

import { Globe } from 'lucide-react';

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
  tr: '🇹🇷'
};

export function LanguageSwitcher() {
  const { currentLanguage, setLanguage } = useLanguage();
  const mounted = useMounted();

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
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
