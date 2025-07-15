"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "pluggedin-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  // Ensure we only access localStorage on the client side
  useEffect(() => {
    setMounted(true);
    
    // Only access localStorage after component is mounted on client
    if (typeof window !== 'undefined') {
      try {
        const savedTheme = localStorage.getItem(storageKey);
        if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system')) {
          setTheme(savedTheme as Theme);
        }
      } catch (error) {
        // localStorage might be disabled, use default theme
        console.warn('localStorage is not available, using default theme');
      }
    }
  }, [storageKey]);

  useEffect(() => {
    // Only apply theme changes after component is mounted on client
    if (!mounted || typeof window === 'undefined') return;
    
    const root = window.document.documentElement;
    
    root.classList.remove("light", "dark");
    
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
      return;
    }
    
    root.classList.add(theme);
  }, [theme, mounted]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      // Only access localStorage on client side
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, theme);
        } catch (error) {
          console.warn('localStorage is not available');
        }
      }
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      <div suppressHydrationWarning style={{ display: 'contents' }}>
        {children}
      </div>
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  
  return context;
}; 