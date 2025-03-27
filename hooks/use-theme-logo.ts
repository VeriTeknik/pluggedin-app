"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/providers/theme-provider";

/**
 * Hook to get the appropriate logo based on the current theme
 * @returns Object containing logo paths for different contexts
 */
export function useThemeLogo() {
  const { theme } = useTheme();
  
  // Initialize with a function to handle SSR
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // In SSR or initial render, we can't access window
    if (typeof window === 'undefined') return false;
    
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    
    // If system theme, check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  
  useEffect(() => {
    // For system theme, we need to check the actual system preference
    if (theme === 'system') {
      // Check system preference
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(systemPrefersDark);
      
      // Listen for changes to system preference
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
      
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      // For explicitly set theme, just use that
      setIsDarkMode(theme === 'dark');
    }
  }, [theme]);
  
  return {
    // Main logo path based on current theme
    logoSrc: isDarkMode ? '/pluggedin-wl.png' : '/pluggedin-wl-black.png',
    
    // Additional logo variants if needed
    smallLogoSrc: isDarkMode ? '/pluggedin-icon.png' : '/pluggedin-icon-black.png',
    
    // Utility to check if in dark mode
    isDarkTheme: isDarkMode
  };
} 