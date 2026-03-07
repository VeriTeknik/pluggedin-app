'use client';

import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle, Lightbulb, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { useMounted } from '@/hooks/use-mounted';

const cards = [
  {
    key: 'dontDoThis',
    icon: ShieldAlert,
    borderColor: 'border-red-500',
    iconBg: 'bg-red-500/10 text-red-500',
  },
  {
    key: 'tryThis',
    icon: CheckCircle,
    borderColor: 'border-glow-green',
    iconBg: 'bg-glow-green/10 text-glow-green',
  },
  {
    key: 'creative',
    icon: Lightbulb,
    borderColor: 'border-amber-500',
    iconBg: 'bg-amber-500/10 text-amber-500',
  },
];

const flowSteps = ['step1', 'step2', 'step3', 'step4'];

export function HowItWorksSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });

  if (!mounted || !ready) return null;

  return (
    <section ref={ref} className="py-24 bg-gradient-to-b from-background to-tech-blue-900/20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('howItWorks.title')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('howItWorks.subtitle')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {cards.map((card, i) => (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 * i }}
              className={`bg-card/50 border border-border/50 rounded-xl p-6 border-t-2 ${card.borderColor}`}
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${card.iconBg}`}>
                <card.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">
                {t(`howItWorks.${card.key}.title`)}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(`howItWorks.${card.key}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-2 flex-wrap mt-10"
        >
          {flowSteps.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span className="px-4 py-2 rounded-full bg-card border border-border/50 text-sm">
                {t(`howItWorks.flow.${step}`)}
              </span>
              {i < flowSteps.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
              )}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
