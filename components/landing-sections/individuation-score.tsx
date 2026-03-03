'use client';

import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { AnimatedNumber } from '@/components/landing-sections/animated-number';
import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';

const progressBars = [
  { key: 'memoryDepth', value: 18, max: 25, color: 'bg-electric-cyan' },
  { key: 'learningVelocity', value: 22, max: 25, color: 'bg-glow-green' },
  { key: 'collectiveContribution', value: 16, max: 25, color: 'bg-neon-purple' },
  { key: 'selfAwareness', value: 11, max: 25, color: 'bg-amber-400' },
];

const maturityLevels = [
  { key: 'nascent', active: false },
  { key: 'developing', active: false },
  { key: 'established', active: false },
  { key: 'mature', active: true },
  { key: 'individuated', active: false },
];

const ACTIVE_INDEX = maturityLevels.findIndex(l => l.active);

export function IndividuationScoreSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });

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
            {t('individuation.title')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('individuation.subtitle')}
          </p>
        </motion.div>

        {/* Score Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-lg mx-auto mb-16"
        >
          <div className="bg-card border rounded-2xl p-8">
            {/* Score Header */}
            <div className="text-center mb-6">
              <p className="text-sm text-muted-foreground uppercase tracking-wider mb-3">
                {t('individuation.cardLabel')}
              </p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-electric-cyan">
                  {/* Demo score: 18+22+16+11 = 67 out of 100 */}
                  <AnimatedNumber target={67} inView={inView} duration={1800} />
                </span>
                <span className="text-2xl text-muted-foreground font-medium">{t('individuation.maxScore')}</span>
              </div>
            </div>

            {/* Level Badge */}
            <div className="flex justify-center mb-8">
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.5 }}
                className="px-4 py-1.5 rounded-full bg-neon-purple/10 text-neon-purple text-sm font-semibold uppercase tracking-wider border border-neon-purple/20"
              >
                {t('individuation.levels.mature')}
              </motion.span>
            </div>

            {/* Progress Bars */}
            <div className="space-y-5">
              {progressBars.map((bar, i) => (
                <div key={bar.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {t(`individuation.bars.${bar.key}`)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {bar.value}/{bar.max}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${t(`individuation.bars.${bar.key}`)} ${bar.value}/${bar.max}`}
                    className="h-2.5 bg-muted rounded-full overflow-hidden"
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={inView ? { width: `${(bar.value / bar.max) * 100}%` } : {}}
                      transition={{ delay: 0.6 + i * 0.15, duration: 0.8, ease: 'easeOut' }}
                      className={`h-full rounded-full ${bar.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Tip Box */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 1.4 }}
              className="mt-6 p-3 rounded-lg bg-muted/50 border border-border/50"
            >
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('individuation.tip')}
              </p>
            </motion.div>
          </div>
        </motion.div>

        {/* Maturity Level Journey */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.0, duration: 0.5 }}
          className="max-w-3xl mx-auto mb-12"
        >
          <div className="flex items-center justify-between relative">
            {/* Connecting line */}
            <div className="absolute top-4 left-8 right-8 h-0.5 bg-border" />
            <div className="absolute top-4 left-8 h-0.5 bg-gradient-to-r from-glow-green via-electric-cyan to-neon-purple"
              style={{ width: '75%' }}
            />

            {maturityLevels.map((level, i) => (
              <motion.div
                key={level.key}
                initial={{ opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1.2 + i * 0.1 }}
                className="flex flex-col items-center relative z-10"
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all',
                    level.active
                      ? 'border-neon-purple bg-neon-purple/20 ring-4 ring-neon-purple/10'
                      : i < ACTIVE_INDEX
                        ? 'border-glow-green/60 bg-glow-green/10'
                        : 'border-border bg-muted/50'
                  )}
                >
                  {level.active && (
                    <div className="w-3 h-3 rounded-full bg-neon-purple" />
                  )}
                  {!level.active && i < ACTIVE_INDEX && (
                    <div className="w-2.5 h-2.5 rounded-full bg-glow-green/60" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs mt-2 font-medium capitalize',
                    level.active
                      ? 'text-neon-purple'
                      : i < ACTIVE_INDEX
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/50'
                  )}
                >
                  {t(`individuation.levels.${level.key}`)}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bottom Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.6, duration: 0.5 }}
          className="text-center"
        >
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-6">
            {t('individuation.teamEffect')}
          </p>
          <Button asChild variant="outline" size="sm" className="border-border/50 hover:border-electric-cyan/40">
            <a href="https://docs.plugged.in/guides/individuation-scoring" target="_blank" rel="noopener noreferrer">
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              {t('individuation.learnMore')}
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
