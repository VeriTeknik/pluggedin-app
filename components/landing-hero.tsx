'use client';

import { ArrowRight, Monitor, Moon, Sun } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/components/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { Glow } from '@/components/ui/glow';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useThemeLogo } from '@/hooks/use-theme-logo';
import { cn } from '@/lib/utils';

export function LandingHero() {
  const [mounted, setMounted] = useState(false);
  const { logoSrc } = useThemeLogo();
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  // Ensure animations only start after component is mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  // Theme options for the enhanced theme selector
  const themeOptions = [
    { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4 mr-2" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4 mr-2" /> },
    { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4 mr-2" /> },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-200 via-violet-400 to-indigo-600 opacity-10 dark:opacity-20" />
      
      {/* Animated grid lines */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
      </div>

      {/* Theme toggle positioned in the top right corner */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      
      <div className="container relative z-10 mx-auto flex max-w-6xl flex-col items-center px-4 py-24 sm:px-6 lg:px-8">
        {/* Logo */}
        <div 
          className={cn(
            "flex items-center gap-4 mb-4 transition-all duration-700 ease-in-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r rounded-full blur-sm opacity-70"></div>
            {/* Only render the logo image once mounted to ensure correct theme is applied */}
            {mounted && (
              <Image
                src="/pluggedin-wl-black.png"
                alt="Plugged.in Logo"
                width={288}
                height={72}
                className="h-18 w-18 relative"
              />
            )}
          </div>
          
        </div>
        
        {/* Title */}
        <h2 
          className={cn(
            "text-3xl font-semibold max-w-2xl text-center transition-all duration-700 delay-200 ease-in-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {t('landing.hero.title')}
          </span>
        </h2>
        
        {/* Subtitle */}
        <p 
          className={cn(
            "text-xl text-muted-foreground max-w-2xl text-center my-6 transition-all duration-700 delay-300 ease-in-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          {t('landing.hero.subtitle')}
        </p>
        
        {/* Actions */}
        <div 
          className={cn(
            "flex gap-4 transition-all duration-700 delay-400 ease-in-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          <Button 
            asChild 
            size="lg" 
            className="px-6 relative overflow-hidden"
          >
            <Link href="/setup-guide">
              {t('landing.gettingStarted.action')}
              <ArrowRight className="ml-2 h-4 w-4" />
              <span className="absolute inset-0 z-0 bg-gradient-to-r from-primary/80 to-primary/40 opacity-30 blur-lg" />
            </Link>
          </Button>
          
          
          
          <Button variant="outline" asChild size="lg" className="px-6">
            <Link href="/mcp-playground">
              {t('landing.features.aiPlayground.action')}
            </Link>
          </Button>
        </div>
        
        {/* Divider */}
        <div 
          className={cn(
            "w-full max-w-lg h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent mt-10 transition-all duration-1000 delay-500 ease-in-out",
            mounted ? "opacity-40 scale-x-100" : "opacity-0 scale-x-0"
          )}
        ></div>
        
        {/* Glow effects */}
        {mounted && (
          <>
            <Glow 
              variant="bottom" 
              className="opacity-60 animate-pulse" 
              style={{ animationDuration: '4s' }}
            />
            <Glow 
              variant="top" 
              className="opacity-30 animate-pulse" 
              style={{ animationDuration: '6s' }}
            />
          </>
        )}
      </div>
    </div>
  );
}
