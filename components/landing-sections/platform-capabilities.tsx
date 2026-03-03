'use client';

import { motion } from 'framer-motion';
import {
  Brain,
  FileText,
  Globe,
  Network,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { useMounted } from '@/hooks/use-mounted';

const capabilities = [
  {
    key: 'mcpHub',
    icon: Server,
    accentColor: 'border-t-electric-cyan',
    iconBg: 'bg-electric-cyan/10',
    iconColor: 'text-electric-cyan',
  },
  {
    key: 'memory',
    icon: Brain,
    accentColor: 'border-t-neon-purple',
    iconBg: 'bg-neon-purple/10',
    iconColor: 'text-neon-purple',
  },
  {
    key: 'knowledge',
    icon: FileText,
    accentColor: 'border-t-glow-green',
    iconBg: 'bg-glow-green/10',
    iconColor: 'text-glow-green',
  },
  {
    key: 'modelAgnostic',
    icon: Globe,
    accentColor: 'border-t-amber-400',
    iconBg: 'bg-amber-400/10',
    iconColor: 'text-amber-400',
  },
  {
    key: 'dataOwnership',
    icon: ShieldCheck,
    accentColor: 'border-t-electric-cyan',
    iconBg: 'bg-electric-cyan/10',
    iconColor: 'text-electric-cyan',
  },
  {
    key: 'openSource',
    icon: Network,
    accentColor: 'border-t-neon-purple',
    iconBg: 'bg-neon-purple/10',
    iconColor: 'text-neon-purple',
  },
];

export function PlatformCapabilitiesSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });

  if (!mounted || !ready) return null;

  return (
    <section ref={ref} className="py-24 bg-gradient-to-b from-background to-tech-blue-900/10">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('platformCapabilities.title')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
            {t('platformCapabilities.subtitle')}
          </p>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.key}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }}
              className={`bg-card border border-t-2 ${cap.accentColor} rounded-xl p-6 hover:shadow-lg transition-shadow duration-300`}
            >
              <div className={`w-12 h-12 rounded-lg ${cap.iconBg} flex items-center justify-center mb-4`}>
                <cap.icon className={`w-6 h-6 ${cap.iconColor}`} />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {t(`platformCapabilities.cards.${cap.key}.title`)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`platformCapabilities.cards.${cap.key}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Bottom stat line */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="text-center mt-16"
        >
          <p className="text-lg font-medium text-foreground">
            {t('platformCapabilities.tagline')}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
