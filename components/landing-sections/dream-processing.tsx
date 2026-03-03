'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { AnimatedNumber } from '@/components/landing-sections/animated-number';
import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

const decayStages = [
  { key: 'full', tokens: 500, color: 'bg-electric-cyan/10 text-electric-cyan border-electric-cyan/20' },
  { key: 'compressed', tokens: 250, color: 'bg-neon-purple/10 text-neon-purple border-neon-purple/20' },
  { key: 'summary', tokens: 150, color: 'bg-amber-400/10 text-amber-400 border-amber-400/20' },
  { key: 'essence', tokens: 50, color: 'bg-glow-green/10 text-glow-green border-glow-green/20' },
];

export function DreamProcessingSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });
  const shouldReduceMotion = useReducedMotion();

  if (!mounted || !ready) return null;

  return (
    <section ref={ref} className="py-24">
      <div className="container mx-auto px-4">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('dream.title')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('dream.subtitle')}
          </p>
        </motion.div>

        {/* Main Visual — Before / Arrow / After */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 mb-16 max-w-4xl mx-auto"
        >
          {/* LEFT — Fragmented memories (stacked cards) */}
          <div className="flex-1 w-full">
            <div className="relative h-48 w-full max-w-xs mx-auto">
              {/* Card 1 (bottom) */}
              <motion.div
                initial={{ opacity: 0, rotate: -6 }}
                animate={inView ? { opacity: 0.4, rotate: -6 } : {}}
                transition={{ delay: 0.3 }}
                className="absolute inset-x-4 top-4 bottom-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4"
              />
              {/* Card 2 */}
              <motion.div
                initial={{ opacity: 0, rotate: -3 }}
                animate={inView ? { opacity: 0.6, rotate: -3 } : {}}
                transition={{ delay: 0.4 }}
                className="absolute inset-x-2 top-2 bottom-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4"
              />
              {/* Card 3 */}
              <motion.div
                initial={{ opacity: 0, rotate: 1 }}
                animate={inView ? { opacity: 0.8, rotate: 1 } : {}}
                transition={{ delay: 0.5 }}
                className="absolute inset-x-1 top-1 bottom-1 rounded-xl border border-red-500/20 bg-red-500/10 p-4"
              />
              {/* Card 4 (top) */}
              <motion.div
                initial={{ opacity: 0, rotate: 2 }}
                animate={inView ? { opacity: 1, rotate: 2 } : {}}
                transition={{ delay: 0.6 }}
                className="absolute inset-0 rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="h-2 w-3/4 bg-red-500/20 rounded mb-2" />
                  <div className="h-2 w-1/2 bg-red-500/20 rounded mb-2" />
                  <div className="h-2 w-2/3 bg-red-500/20 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500/40" />
                  <div className="h-2 w-2 rounded-full bg-red-500/40" />
                  <div className="h-2 w-2 rounded-full bg-red-500/40" />
                </div>
              </motion.div>
            </div>
            <div className="text-center mt-4">
              <p className="font-semibold text-red-400">{t('dream.before')}</p>
              <p className="text-sm text-muted-foreground">{t('dream.tokensBefore')}</p>
            </div>
          </div>

          {/* CENTER — Arrow / Flow indicator */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="flex flex-col items-center gap-2 shrink-0"
          >
            <motion.div
              animate={inView && !shouldReduceMotion ? {
                boxShadow: [
                  '0 0 10px rgba(147, 51, 234, 0.3)',
                  '0 0 25px rgba(147, 51, 234, 0.6)',
                  '0 0 10px rgba(147, 51, 234, 0.3)',
                ],
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className="px-4 py-2 rounded-full bg-neon-purple/10 border border-neon-purple/30"
            >
              <span className="text-sm font-medium text-neon-purple whitespace-nowrap">
                {t('dream.processingLabel')}
              </span>
            </motion.div>
            <div className="hidden md:block">
              <ArrowRight className="w-8 h-8 text-neon-purple/60" />
            </div>
            <div className="block md:hidden">
              <motion.div
                animate={inView && !shouldReduceMotion ? { y: [0, 4, 0] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <ArrowRight className="w-8 h-8 text-neon-purple/60 rotate-90" />
              </motion.div>
            </div>
          </motion.div>

          {/* RIGHT — Single consolidated card */}
          <div className="flex-1 w-full">
            <div className="relative h-48 w-full max-w-xs mx-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="absolute inset-0 rounded-xl border border-glow-green/20 bg-glow-green/10 p-5 flex flex-col justify-between"
                style={{
                  boxShadow: '0 0 30px rgba(16, 185, 129, 0.1)',
                }}
              >
                <div>
                  <div className="h-2.5 w-full bg-glow-green/20 rounded mb-3" />
                  <div className="h-2.5 w-5/6 bg-glow-green/20 rounded mb-3" />
                  <div className="h-2.5 w-4/6 bg-glow-green/20 rounded mb-3" />
                  <div className="h-2.5 w-3/4 bg-glow-green/20 rounded" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-glow-green/60" />
                  <span className="text-xs text-glow-green/60 font-medium">{t('dream.consolidated')}</span>
                </div>
              </motion.div>
            </div>
            <div className="text-center mt-4">
              <p className="font-semibold text-glow-green">{t('dream.after')}</p>
              <p className="text-sm text-muted-foreground">{t('dream.tokensAfter')}</p>
            </div>
          </div>
        </motion.div>

        {/* Animated Counter — 92% token reduction */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.0, duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-baseline gap-1 text-4xl md:text-5xl font-bold">
            <motion.span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-glow-green">
              {/* 500t raw → 40t essence = 92% reduction in dream processing */}
              <AnimatedNumber target={92} inView={inView} />
            </motion.span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-glow-green">
              %
            </span>
          </div>
          <p className="text-muted-foreground mt-2 text-lg">{t('dream.tokenReduction')}</p>
        </motion.div>

        {/* Decay Stages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          <p className="text-center text-muted-foreground mb-6">
            {t('dream.decay')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
            {decayStages.map((stage, i) => (
              <motion.div
                key={stage.key}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 1.3 + i * 0.1 }}
                className="flex items-center gap-2 md:gap-3"
              >
                <div className={`px-3 py-1.5 rounded-full border text-sm font-medium ${stage.color}`}>
                  <span className="uppercase text-xs tracking-wide">{t(`dream.${stage.key}`)}</span>
                  <span className="ml-1.5 opacity-70 text-xs">{stage.tokens}t</span>
                </div>
                {i < decayStages.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 hidden md:block" />
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Doc link */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.5, duration: 0.5 }}
          className="text-center mt-12"
        >
          <Button asChild variant="outline" size="sm" className="border-border/50 hover:border-neon-purple/40">
            <a href="https://docs.plugged.in/guides/dream-processing" target="_blank" rel="noopener noreferrer">
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              {t('dream.learnMore')}
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
