"use client";

import { useEffect, useState } from "react";

import { useTheme } from "@/components/providers/theme-provider";

import { useMounted } from "./use-mounted"; // Import a simple mounted hook

/**
 * Hook to get the appropriate logo based on the current theme, handling hydration mismatch.
 * @returns Object containing logo paths for different contexts
 */
export function useThemeLogo() {
  const { theme } = useTheme();
  const mounted = useMounted(); // Use a hook to check if mounted

  // Default to light theme logo initially to match server render
  const [isDarkMode, setIsDarkMode] = useState(false); 

  useEffect(() => {
    // Only run theme detection logic on the client after mounting
    if (!mounted) return;

    // Determine dark mode based on theme setting or system preference
    let darkMode = false;
    if (theme === 'dark') {
      darkMode = true;
    } else if (theme === 'light') {
      darkMode = false;
    } else { // theme === 'system'
      darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    setIsDarkMode(darkMode);

    // If theme is 'system', add listener for changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
      mediaQuery.addEventListener('change', handler);
      // Cleanup listener on unmount or theme change
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme, mounted]); // Depend on theme and mounted status

  // Return default (light) logo until mounted, then return theme-specific logo
  const defaultLogo = '/pluggedin-wl-black.png';
  const defaultSmallLogo = '/pluggedin-icon-black.png';

  return {
    logoSrc: mounted ? (isDarkMode ? '/pluggedin-wl.png' : defaultLogo) : defaultLogo,
    smallLogoSrc: mounted ? (isDarkMode ? '/pluggedin-icon.png' : defaultSmallLogo) : defaultSmallLogo,
    isDarkTheme: mounted ? isDarkMode : false // Default to false until mounted
  };
}
