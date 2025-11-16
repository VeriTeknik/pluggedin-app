'use client';

import { motion } from 'framer-motion';
import { BookOpen, Bot, Database, Wrench, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

const pillars = [
  {
    key: 'knowledge',
    icon: BookOpen,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    hoverBorder: 'hover:border-blue-500/50',
    iconColor: 'text-blue-500',
  },
  {
    key: 'tools',
    icon: Wrench,
    color: 'from-orange-500 to-yellow-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
    hoverBorder: 'hover:border-orange-500/50',
    iconColor: 'text-orange-500',
  },
  {
    key: 'memory',
    icon: Database,
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    hoverBorder: 'hover:border-purple-500/50',
    iconColor: 'text-purple-500',
    badge: 'Coming Soon',
  },
  {
    key: 'agents',
    icon: Bot,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    hoverBorder: 'hover:border-green-500/50',
    iconColor: 'text-green-500',
    badge: 'NEW',
    badgeColor: 'bg-green-500',
  },
];

export function FourPillarsSection() {
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
    <section id="four-pillars" ref={ref} className="relative py-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-tech-blue-950/10 to-background" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="container relative z-10 mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={inView ? { scale: 1, opacity: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-electric-cyan/10 to-neon-purple/10 border border-electric-cyan/20 mb-6"
          >
            <Sparkles className="w-4 h-4 text-electric-cyan" />
            <span className="text-sm font-medium text-electric-cyan">
              {t('fourPillars.badge')}
            </span>
          </motion.div>

          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-electric-cyan to-neon-purple">
              {t('fourPillars.title')}
            </span>
          </h2>

          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('fourPillars.subtitle')}
          </p>
        </motion.div>

        {/* Pillars Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {pillars.map((pillar, index) => (
            <motion.div
              key={pillar.key}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.3 + index * 0.1, duration: 0.6 }}
              className="group relative"
            >
              {/* Glow Effect */}
              <div className={`absolute inset-0 bg-gradient-to-r ${pillar.color} rounded-3xl blur-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />

              {/* Card */}
              <div className={`relative bg-card/80 backdrop-blur-sm rounded-3xl p-8 border ${pillar.borderColor} ${pillar.hoverBorder} transition-all duration-300 h-full`}>
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className={`w-14 h-14 rounded-2xl ${pillar.bgColor} flex items-center justify-center`}>
                    <pillar.icon className={`w-7 h-7 ${pillar.iconColor}`} />
                  </div>

                  {pillar.badge && (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${pillar.badgeColor || 'bg-muted'} ${pillar.badgeColor ? 'text-white' : 'text-foreground'}`}>
                      {pillar.badge}
                    </span>
                  )}
                </div>

                {/* Content */}
                <h3 className="text-2xl font-bold mb-3">
                  {t(`fourPillars.${pillar.key}.title`)}
                </h3>

                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {t(`fourPillars.${pillar.key}.description`)}
                </p>

                {/* Features List */}
                <ul className="space-y-3 mb-6">
                  {[1, 2, 3].map((num) => (
                    <li key={num} className="flex items-start gap-2">
                      <CheckCircle2 className={`w-5 h-5 ${pillar.iconColor} flex-shrink-0 mt-0.5`} />
                      <span className="text-sm text-muted-foreground">
                        {t(`fourPillars.${pillar.key}.features.${num}`)}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Use Case / Highlight */}
                {pillar.key !== 'memory' && (
                  <div className={`mt-auto pt-6 border-t ${pillar.borderColor}`}>
                    <p className="text-sm font-medium mb-2 ${pillar.iconColor}">
                      {t(`fourPillars.${pillar.key}.highlightLabel`)}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed italic">
                      "{t(`fourPillars.${pillar.key}.highlight`)}"
                    </p>
                  </div>
                )}

                {/* Memory: Coming Soon Message */}
                {pillar.key === 'memory' && (
                  <div className={`mt-auto pt-6 border-t ${pillar.borderColor}`}>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t('fourPillars.memory.comingSoon')}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.9 }}
          className="text-center mt-16"
        >
          <p className="text-lg text-muted-foreground mb-6">
            {t('fourPillars.cta.text')}
          </p>
          <Button
            asChild
            size="lg"
            className="bg-gradient-to-r from-electric-cyan to-neon-purple hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all duration-300"
          >
            <Link href="/login">
              {t('fourPillars.cta.button')}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
