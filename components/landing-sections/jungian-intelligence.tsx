'use client';

import { motion } from 'framer-motion';
import { Brain, Moon, Shield, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { useMounted } from '@/hooks/use-mounted';

const archetypes = [
  { key: 'shadow', icon: Shield, color: 'text-red-400' },
  { key: 'sage', icon: Brain, color: 'text-blue-400' },
  { key: 'hero', icon: Sparkles, color: 'text-yellow-400' },
  { key: 'trickster', icon: Moon, color: 'text-purple-400' },
];

export function JungianIntelligenceSection() {
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
            {t('jungian.title')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('jungian.subtitle')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {archetypes.map((archetype, i) => (
            <motion.div
              key={archetype.key}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 * i }}
              className="rounded-xl border bg-card p-6 text-center"
            >
              <archetype.icon className={`w-10 h-10 mx-auto mb-4 ${archetype.color}`} />
              <h3 className="font-semibold mb-2">
                {t(`jungian.archetypes.${archetype.key}`)}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(`jungian.archetypes.${archetype.key}Desc`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
