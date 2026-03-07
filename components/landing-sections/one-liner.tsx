'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, BookOpen, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { useMounted } from '@/hooks/use-mounted';

const scenarios = [
  {
    key: 'bug',
    icon: Clock,
  },
  {
    key: 'production',
    icon: AlertTriangle,
  },
  {
    key: 'framework',
    icon: BookOpen,
  },
];

export function ScenariosSection() {
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
    <section ref={ref} className="py-24 bg-gradient-to-b from-background to-tech-blue-900/20">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-electric-cyan to-neon-purple">
              {t('scenarios.title')}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('scenarios.subtitle')}
          </p>
        </motion.div>

        {/* Scenario Cards */}
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
          {scenarios.map((scenario, index) => (
            <motion.div
              key={scenario.key}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.3 + index * 0.1, duration: 0.6 }}
              className="bg-card/50 border border-border/50 rounded-xl overflow-hidden"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <scenario.icon className="w-5 h-5 text-electric-cyan" />
                  <h3 className="text-base font-semibold">
                    {t(`scenarios.${scenario.key}.title`)}
                  </h3>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-electric-cyan/10 text-electric-cyan">
                  {t(`scenarios.${scenario.key}.label`)}
                </span>
              </div>

              {/* Card Body - Before / After */}
              <div className="grid grid-cols-1 md:grid-cols-2">
                {/* Before */}
                <div className="p-4 md:p-6 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
                    {t('scenarios.beforeLabel')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(`scenarios.${scenario.key}.before`)}
                  </p>
                </div>

                {/* After */}
                <div className="p-4 md:p-6 bg-glow-green/5 border-l border-glow-green/20">
                  <p className="text-xs font-medium text-glow-green uppercase tracking-wider mb-2">
                    {t('scenarios.afterLabel')}
                  </p>
                  <p className="text-sm text-foreground font-medium">
                    {t(`scenarios.${scenario.key}.after`)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
