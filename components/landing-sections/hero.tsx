'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';
import { useGithubStars } from '@/hooks/useGithubStars';
import { cn } from '@/lib/utils';

// TODO: Integrate MagicUI components when available:
// - Background with cubes animation and gradient effects
// - Aurora-text for headline/subheadline
// - Sparkles-text for headline

export function LandingHeroSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');
  const stars = useGithubStars('VeriTeknik/pluggedin-app');

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

        {/* Version Badge */}
        <div
          className={cn(
            'mt-4 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-all duration-700 delay-350 ease-in-out',
            mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          )}
        >
          {t('hero.version')}
        </div>

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
        <div
          className={cn(
            'mt-6 flex flex-col items-center text-xs text-muted-foreground transition-all duration-700 delay-500 ease-in-out',
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
        >
          <span>{t('hero.openSource')}</span>
          <a
            href="https://github.com/VeriTeknik/pluggedin-app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline hover:text-primary mt-1"
          >
            <svg
              width="16"
              height="16"
              fill="currentColor"
              viewBox="0 0 16 16"
              className="inline-block"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.11 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.91.08 2.11.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            {stars !== null ? stars : '...'} stars
          </a>
        </div>
      </div>
    </section>
  );
}
