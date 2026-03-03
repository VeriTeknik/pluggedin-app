'use client';

import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Star } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { InstallSnippet } from '@/components/landing-sections/install-snippet';
import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

export function CtaPluginSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');

  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  if (!mounted || !ready) {
    return null;
  }

  return (
    <section ref={ref} className="relative py-24 overflow-hidden">
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Radial Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-electric-cyan/5 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-neon-purple/5 rounded-full blur-3xl" />

      <div className="container relative z-10 mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center">
          {/* Headline */}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.2 }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold mb-10"
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-electric-cyan to-neon-purple">
              {t('ctaPlugin.headline')}
            </span>
          </motion.h2>

          {/* Install Code Block */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3 }}
            className="relative max-w-2xl mx-auto mb-10"
          >
            <InstallSnippet
              copyLabel={t('ctaPlugin.copy')}
              copiedLabel={t('ctaPlugin.copied')}
            />
          </motion.div>

          {/* Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap justify-center gap-4 mb-10"
          >
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-electric-cyan/20 hover:bg-electric-cyan/10"
            >
              <a
                href="https://github.com/VeriTeknik/pluggedin-plugin"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Star className="mr-2 h-4 w-4" />
                {t('ctaPlugin.starOnGithub')}
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-neon-purple/20 hover:bg-neon-purple/10"
            >
              <a
                href="https://docs.plugged.in"
                target="_blank"
                rel="noopener noreferrer"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                {t('ctaPlugin.readDocs')}
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-glow-green/20 hover:bg-glow-green/10"
            >
              <Link href="/login">
                {t('ctaPlugin.platform')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.div>

          {/* Footer Line */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.6 }}
            className="text-sm text-muted-foreground/60"
          >
            {t('ctaPlugin.footer')}
          </motion.p>
        </div>
      </div>
    </section>
  );
}
