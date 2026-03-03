'use client';

import { motion } from 'framer-motion';
import { Brain, Compass, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { useMounted } from '@/hooks/use-mounted';

const columns = [
  {
    key: 'personal',
    icon: Brain,
    colorClass: 'text-electric-cyan',
    borderClass: 'border-l-electric-cyan',
    bgGlow: 'from-electric-cyan/10',
  },
  {
    key: 'collective',
    icon: Users,
    colorClass: 'text-neon-purple',
    borderClass: 'border-l-neon-purple',
    bgGlow: 'from-neon-purple/10',
  },
  {
    key: 'archetypal',
    icon: Compass,
    colorClass: 'text-glow-green',
    borderClass: 'border-l-glow-green',
    bgGlow: 'from-glow-green/10',
  },
];

export function OneLinerSection() {
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
        {/* Bold Statement */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-electric-cyan to-neon-purple">
              {t('oneLiner.statement')}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('oneLiner.subtitle')}
          </p>
        </motion.div>

        {/* Three Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {columns.map((col, index) => (
            <motion.div
              key={col.key}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.3 + index * 0.15, duration: 0.6 }}
              className="group relative"
            >
              {/* Glow Effect */}
              <div className={`absolute inset-0 bg-gradient-to-r ${col.bgGlow} to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

              {/* Card */}
              <div className={`relative bg-card rounded-xl border border-border/50 p-6 border-l-4 ${col.borderClass} hover:border-border transition-all duration-300 h-full`}>
                <col.icon className={`w-10 h-10 mb-4 ${col.colorClass}`} />
                <h3 className="text-lg font-semibold mb-2">
                  {t(`oneLiner.${col.key}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`oneLiner.${col.key}.desc`)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
