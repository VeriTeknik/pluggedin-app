'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';

// TODO: Integrate MagicUI components when available:
// - Background with cubes animation and gradient effects
// - Aurora-text for headline/subheadline
// - Sparkles-text for headline

export function LandingHeroSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');

  // Don't render until translations are ready and component is mounted
  if (!mounted || !ready) {
    return null;
  }

  return (
    <section className="relative overflow-hidden py-24 md:py-32 lg:py-40">
      {/* Placeholder for background animation */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-background via-muted to-background opacity-50" />
      {/* Add more sophisticated background/animation later */}

      <div className="container relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 text-center">
        {/* Headline */}
        <h1
          className={cn(
            'text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl transition-all duration-700 ease-in-out',
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
            // TODO: Apply Aurora-text / Sparkles-text here
            'bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent pb-2' // Basic gradient as fallback
          )}
        >
          {t('hero.headline')}
        </h1>

        {/* Subheadline */}
        <p
          className={cn(
            'mt-4 text-lg text-muted-foreground sm:text-xl md:text-2xl transition-all duration-700 delay-200 ease-in-out',
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            // TODO: Apply Aurora-text here if desired
          )}
        >
          {t('hero.subheadline')}
        </p>

        {/* Analogy */}
        <p
          className={cn(
            'mt-2 text-sm font-medium text-primary italic transition-all duration-700 delay-300 ease-in-out',
             mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
        >
          {t('hero.analogy')}
        </p>

        {/* Actions */}
        <div
          className={cn(
            'mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center transition-all duration-700 delay-400 ease-in-out',
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
        >
          <Button asChild size="lg">
            {/* TODO: Update href to actual signup/app page */}
            <Link href="/login">
              {t('hero.cta.getStarted')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
             {/* TODO: Update href to a relevant section or docs page */}
            <Link href="#features">
              {t('hero.cta.learnMore')}
            </Link>
          </Button>
        </div>

        {/* Open Source Mention */}
        <p
          className={cn(
            'mt-6 text-xs text-muted-foreground transition-all duration-700 delay-500 ease-in-out',
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
        >
          {t('hero.openSource')}
        </p>
      </div>
    </section>
  );
}
