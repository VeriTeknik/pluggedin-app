'use client';

import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Bot, Database, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

import { ParticleBackground } from './particle-background';

export function LandingHeroEnterpriseSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');

  // Four pillars icons
  const pillars = [
    { icon: BookOpen, text: t('hero.pillars.knowledge') },
    { icon: Wrench, text: t('hero.pillars.tools') },
    { icon: Database, text: t('hero.pillars.memory') },
    { icon: Bot, text: t('hero.pillars.agents') },
  ];

  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  if (!mounted || !ready) {
    return null;
  }

  return (
    <section ref={ref} className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-tech-blue-900 via-background to-tech-blue-900">
      {/* Animated Background */}
      <ParticleBackground />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

      <div className="container relative z-10 mx-auto px-4 py-32">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.2 }}
            className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-electric-cyan/10 to-neon-purple/10 border border-electric-cyan/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-electric-cyan opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-electric-cyan" />
            </span>
            <span className="text-sm font-medium text-electric-cyan">
              {t('hero.badge')}
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3 }}
            className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-electric-cyan to-neon-purple">
              {t('hero.headline')}
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4 }}
            className="text-lg md:text-xl text-muted-foreground mb-12 leading-relaxed max-w-3xl mx-auto"
          >
            {t('hero.subheadline')}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap justify-center gap-4 mb-16"
          >
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-electric-cyan to-neon-purple hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all duration-300 text-base px-8"
            >
              <Link href="/login">
                {t('hero.cta.primary')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-electric-cyan/20 hover:bg-electric-cyan/10 text-base px-8"
            >
              <Link href="#how-it-works">
                {t('hero.cta.secondary')}
              </Link>
            </Button>
          </motion.div>

          {/* Four Pillars Preview */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.6 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
          >
            {pillars.map((pillar, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.7 + index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-electric-cyan/20 to-neon-purple/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative bg-background/80 backdrop-blur-sm rounded-2xl p-6 border border-border/50 hover:border-electric-cyan/50 transition-all duration-300">
                  <pillar.icon className="w-8 h-8 text-electric-cyan mb-3 mx-auto" />
                  <div className="text-sm font-medium">{pillar.text}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 1 }}
            className="mt-12 text-sm text-muted-foreground/60"
          >
            {t('hero.tagline')}
          </motion.p>
        </div>
      </div>
    </section>
  );
}