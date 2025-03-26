'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useThemeLogo } from '@/hooks/use-theme-logo';

export function LandingHero() {
  const [mounted, setMounted] = useState(false);
  const { logoSrc } = useThemeLogo();
  const { t } = useTranslation();

  // Ensure animations only start after component is mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative">
      {/* Theme toggle positioned in the top right corner */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      
      <div className="flex flex-col items-center justify-center text-center space-y-8 py-16">
        <div className={`flex items-center gap-4 mb-4 transition-all duration-700 ease-in-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-primary/60 rounded-full blur-sm opacity-70"></div>
            {/* Only render the logo image once mounted to ensure correct theme is applied */}
            {mounted && (
              <Image
                src={logoSrc}
                alt="Plugged.in Logo"
                width={72}
                height={72}
                className="h-18 w-18 relative"
              />
            )}
          </div>
          <h1 className="text-5xl font-bold">Plugged.in</h1>
        </div>
        
        <h2 className={`text-3xl font-semibold max-w-2xl transition-all duration-700 delay-200 ease-in-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {t('landing.hero.title')}
        </h2>
        
        <p className={`text-xl text-muted-foreground max-w-2xl transition-all duration-700 delay-300 ease-in-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {t('landing.hero.subtitle')}
        </p>
        
        <div className={`flex gap-4 mt-8 transition-all duration-700 delay-400 ease-in-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <Button asChild size="lg" className="px-6">
            <Link href="/setup-guide">
              {t('landing.gettingStarted.action')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild size="lg" className="px-6">
            <Link href="/mcp-playground">
              {t('landing.features.aiPlayground.action')}
            </Link>
          </Button>
        </div>
        
        <div className={`w-full max-w-lg h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent mt-6 transition-all duration-1000 delay-500 ease-in-out ${mounted ? 'opacity-40 scale-x-100' : 'opacity-0 scale-x-0'}`}></div>
      </div>
    </div>
  );
}
