'use client';

import { ArrowRight, CheckCircle, Shield, Zap, Globe } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { GlowCard } from '@/components/ui/glow-card';
import { AnimatedMetric } from '@/components/ui/animated-metric';
import { GrowthBadge } from '@/components/ui/growth-badge';
import { ParticleBackground } from './particle-background';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';
import { PLATFORM_METRICS, METRIC_STRINGS } from '@/lib/constants/metrics';

const metrics = [
  PLATFORM_METRICS.TOOLS,
  PLATFORM_METRICS.SERVERS,
  PLATFORM_METRICS.UPTIME,
  PLATFORM_METRICS.RESPONSE_TIME,
];

export function LandingHeroEnterpriseSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');

  const features = [
    { icon: Shield, text: t('hero.features.security') },
    { icon: Zap, text: t('hero.features.fast') },
    { icon: Globe, text: t('hero.features.scale') },
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
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="text-left"
          >
            {/* Growth Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 }}
              className="mb-6"
            >
              <GrowthBadge value="718%" label={t('metrics.growth.label')} size="lg" />
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.3 }}
              className="text-5xl lg:text-7xl font-bold mb-6"
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
              className="text-xl text-muted-foreground mb-8 leading-relaxed"
            >
              {t('hero.subheadline')}
            </motion.p>

            {/* Features List */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap gap-4 mb-8"
            >
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/50 backdrop-blur-sm border border-border/50"
                >
                  <feature.icon className="w-4 h-4 text-electric-cyan" />
                  <span className="text-sm">{feature.text}</span>
                </div>
              ))}
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.6 }}
              className="flex flex-wrap gap-4"
            >
              <Button
                asChild
                size="lg"
                className="bg-gradient-to-r from-electric-cyan to-neon-purple hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all duration-300"
              >
                <Link href="/login">
                  {t('hero.cta.getStarted')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-electric-cyan/20 hover:bg-electric-cyan/10"
              >
                <Link href="/search">
                  {t('hero.cta.learnMore')}
                  <svg className="ml-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5z" />
                  </svg>
                </Link>
              </Button>
            </motion.div>
          </motion.div>

          {/* Right Content - Floating Metrics */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="grid grid-cols-2 gap-4">
              {metrics.map((metric, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.7 + index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  className="animate-float"
                  style={{ animationDelay: `${index * 0.5}s` }}
                >
                  <GlowCard className="hover:animate-pulse-glow">
                    <AnimatedMetric
                      value={metric.value}
                      suffix={metric.suffix}
                      prefix={'prefix' in metric ? metric.prefix : undefined}
                      label={metric.label}
                      decimals={'decimals' in metric ? metric.decimals : undefined}
                    />
                  </GlowCard>
                </motion.div>
              ))}
            </div>

            {/* Central Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 1.2, type: 'spring' }}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-electric-cyan/20 blur-xl rounded-full animate-pulse" />
                <div className="relative bg-background/90 backdrop-blur-xl rounded-full p-6 border border-electric-cyan/20">
                  <Shield className="w-12 h-12 text-electric-cyan" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Bottom Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.4 }}
          className="mt-20 pt-10 border-t border-border/20"
        >
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-electric-cyan">
                {PLATFORM_METRICS.DEVELOPERS.value}{PLATFORM_METRICS.DEVELOPERS.suffix}
              </div>
              <div className="text-sm text-muted-foreground">{PLATFORM_METRICS.DEVELOPERS.label}</div>
            </div>
            <div className="hidden md:block w-px h-8 bg-border/50" />
            <div className="text-center">
              <div className="text-2xl font-bold text-electric-cyan">
                {PLATFORM_METRICS.API_CALLS.formatted}
              </div>
              <div className="text-sm text-muted-foreground">{PLATFORM_METRICS.API_CALLS.shortLabel}</div>
            </div>
            <div className="hidden md:block w-px h-8 bg-border/50" />
            <div className="text-center">
              <div className="text-2xl font-bold text-electric-cyan">
                {PLATFORM_METRICS.PROJECTS.value}{PLATFORM_METRICS.PROJECTS.suffix}
              </div>
              <div className="text-sm text-muted-foreground">{PLATFORM_METRICS.PROJECTS.label}</div>
            </div>
            <div className="hidden md:block w-px h-8 bg-border/50" />
            <div className="text-center">
              <div className="text-2xl font-bold text-electric-cyan">
                {PLATFORM_METRICS.ACTIVE_SERVERS.value}
              </div>
              <div className="text-sm text-muted-foreground">{PLATFORM_METRICS.ACTIVE_SERVERS.label}</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}