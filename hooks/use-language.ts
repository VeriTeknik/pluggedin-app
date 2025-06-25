'use client';

import { useCallback, useRef } from 'react';
import debounce from 'lodash/debounce';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/hooks/use-auth';
import { isRTL, type Locale } from '@/i18n/config';

class LanguageStorage {
  private static readonly LANGUAGE_KEY = 'pluggedin_language';
  
  static getStoredLanguage(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    return localStorage.getItem(this.LANGUAGE_KEY);
  }

  static setStoredLanguage(language: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(this.LANGUAGE_KEY, language);
  }
}

export function useLanguage() {
  const { i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  
  // Create a persistent debounced function using useRef
  const updateLanguageDebounced = useRef(
    debounce(async (language: string, isAuth: boolean) => {
      // Only attempt to update database if user is authenticated
      if (!isAuth) {
        return;
      }
      
      try {
        const response = await fetch('/api/settings/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            language,
            name: undefined // Keep existing name
          }),
        });

        if (!response.ok) {
          console.error('Failed to update language in database:', await response.text());
        }
      } catch (error) {
        console.error('Failed to update language in database:', error);
      }
    }, 300)
  ).current;
  
  const setLanguage = useCallback(async (language: Locale) => {
    try {
      // Update i18next
      await i18n.changeLanguage(language);
      
      // Update localStorage
      LanguageStorage.setStoredLanguage(language);
      
      // Update document language
      document.documentElement.lang = language;
      
      // Update direction for RTL support
      document.documentElement.dir = isRTL(language) ? 'rtl' : 'ltr';

      // Update language in database (debounced) - only if authenticated
      updateLanguageDebounced(language, isAuthenticated);
    } catch (error) {
      console.error('Failed to update language:', error);
      // Revert to previous language if update fails
      const prevLang = i18n.language;
      await i18n.changeLanguage(prevLang);
    }
  }, [i18n, updateLanguageDebounced, isAuthenticated]);

  return {
    currentLanguage: i18n.language as Locale,
    setLanguage,
    isRTL: isRTL(i18n.language)
  };
}
