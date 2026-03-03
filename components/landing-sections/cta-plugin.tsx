'use client';

import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Copy, Star } from 'lucide-react';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

const installCommands = `/plugin marketplace add VeriTeknik/pluggedin-plugin
/plugin install pluggedin`;

export function CtaPluginSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');
  const [copied, setCopied] = useState(false);

  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(installCommands).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

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
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-electric-cyan/20 to-neon-purple/20 rounded-lg blur opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
              <div className="relative bg-[#0d1117] rounded-lg border border-border/50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/60" />
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? t('ctaPlugin.copied') : t('ctaPlugin.copy')}
                  </button>
                </div>
                <pre className="px-6 py-5 text-left font-mono text-sm md:text-base leading-relaxed overflow-x-auto">
                  <code>
                    <span className="text-electric-cyan">/plugin</span>
                    <span className="text-muted-foreground"> marketplace add </span>
                    <span className="text-glow-green">VeriTeknik/pluggedin-plugin</span>
                    {'\n'}
                    <span className="text-electric-cyan">/plugin</span>
                    <span className="text-muted-foreground"> install </span>
                    <span className="text-glow-green">pluggedin</span>
                  </code>
                </pre>
              </div>
            </div>
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
                href="https://github.com/veriteknik/pluggedin-app"
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
