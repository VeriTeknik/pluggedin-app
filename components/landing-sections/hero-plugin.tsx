'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { InstallSnippet } from '@/components/landing-sections/install-snippet';
import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

export function HeroPluginSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');

  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  if (!mounted || !ready) {
    return (
      <section className="relative min-h-[80vh] flex items-center overflow-hidden bg-gradient-to-br from-tech-blue-900 via-background to-tech-blue-900">
        <div className="container mx-auto px-4 py-24">
          <div className="max-w-4xl mx-auto text-center animate-pulse">
            <div className="h-8 w-48 bg-muted rounded-full mx-auto mb-6" />
            <div className="h-12 w-3/4 bg-muted rounded mx-auto mb-6" />
            <div className="h-6 w-2/3 bg-muted rounded mx-auto mb-12" />
            <div className="h-24 w-full max-w-2xl bg-muted rounded-lg mx-auto mb-10" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className="relative min-h-[80vh] flex items-center overflow-hidden bg-gradient-to-br from-tech-blue-900 via-background to-tech-blue-900"
    >
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

      <div className="container relative z-10 mx-auto px-4 py-24">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.2 }}
            className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-glow-green/10 border border-glow-green/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-glow-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-glow-green" />
            </span>
            <span className="text-sm font-medium text-glow-green">
              {t('heroPlugin.badge')}
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3 }}
            className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-electric-cyan to-neon-purple">
              {t('heroPlugin.headline')}
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4 }}
            className="text-lg md:text-xl text-muted-foreground mb-12 leading-relaxed max-w-3xl mx-auto"
          >
            {t('heroPlugin.subtitle')}
          </motion.p>

          {/* Install Code Block */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.5 }}
            className="relative max-w-2xl mx-auto mb-10"
          >
            <InstallSnippet
              copyLabel={t('heroPlugin.copy')}
              copiedLabel={t('heroPlugin.copied')}
              setupHint={t('heroPlugin.setupHint')}
            />
          </motion.div>

          {/* Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.6 }}
            className="flex flex-wrap justify-center gap-4 mb-14"
          >
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-electric-cyan/20 hover:bg-electric-cyan/10 text-base px-8"
            >
              <a
                href="https://github.com/VeriTeknik/pluggedin-plugin"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Star className="mr-2 h-5 w-5" />
                {t('heroPlugin.starOnGithub')}
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-neon-purple/20 hover:bg-neon-purple/10 text-base px-8"
            >
              <a href="#terminal-demo">
                <ArrowRight className="mr-2 h-5 w-5" />
                {t('heroPlugin.howItWorks')}
              </a>
            </Button>
          </motion.div>

          {/* Stats Bar */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.8 }}
            className="text-sm text-muted-foreground/60"
          >
            {t('heroPlugin.stats')}
          </motion.p>
        </div>
      </div>
    </section>
  );
}
