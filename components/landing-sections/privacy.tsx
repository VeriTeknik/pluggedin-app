'use client';

import { motion } from 'framer-motion';
import { Clock, Hash, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { useMounted } from '@/hooks/use-mounted';

const privacyCards = [
  {
    key: 'identity',
    icon: Hash,
    accentColor: 'border-t-electric-cyan',
    iconBg: 'bg-electric-cyan/10',
    iconColor: 'text-electric-cyan',
  },
  {
    key: 'kanonymity',
    icon: Users,
    accentColor: 'border-t-neon-purple',
    iconBg: 'bg-neon-purple/10',
    iconColor: 'text-neon-purple',
  },
  {
    key: 'temporal',
    icon: Clock,
    accentColor: 'border-t-glow-green',
    iconBg: 'bg-glow-green/10',
    iconColor: 'text-glow-green',
  },
];

export function PrivacySection() {
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
          className="text-center mb-6"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('privacy.title')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('privacy.subtitle')}
          </p>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-12">
          {privacyCards.map((card, i) => (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.5 }}
              className={`bg-card border border-t-2 ${card.accentColor} rounded-xl p-6 hover:shadow-lg transition-shadow duration-300`}
            >
              <div className={`w-12 h-12 rounded-lg ${card.iconBg} flex items-center justify-center mb-4`}>
                <card.icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {t(`privacy.${card.key}.title`)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`privacy.${card.key}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Bottom Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="text-center mt-16"
        >
          <p className="text-lg font-medium text-foreground">
            {t('privacy.tagline')}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Open source &middot; Self-hostable &middot; MIT licensed
          </p>
        </motion.div>
      </div>
    </section>
  );
}
