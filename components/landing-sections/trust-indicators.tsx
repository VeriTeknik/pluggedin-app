'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Award, CheckCircle2, Lock, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { AnimatedMetric } from '@/components/ui/animated-metric';

const certifications = [
  { icon: Shield, key: 'soc2' },
  { icon: Lock, key: 'pciDss' }, // Changed from 'iso' to 'pciDss'
  { icon: Award, key: 'gdpr' },
  { icon: CheckCircle2, key: 'hipaa' },
];

interface PlatformMetrics {
  totalUsers: number;
  totalProjects: number;
  totalServers: number;
  activeProfiles30d: number;
  newUsers30d: number;
}

export function TrustIndicatorsSection() {
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  // Fetch metrics from API
  const [metrics, setMetrics] = useState<PlatformMetrics>({
    totalUsers: 848, // Production fallback
    totalProjects: 900,
    totalServers: 782, // Production fallback
    activeProfiles30d: 135,
    newUsers30d: 123,
  });

  useEffect(() => {
    fetch('/api/platform-metrics')
      .then(res => res.json())
      .then(data => setMetrics(data))
      .catch(err => console.error('Error fetching metrics:', err));
  }, []);

  // Dynamic stats based on fetched metrics
  const stats = [
    { value: 718, suffix: '%', label: 'Monthly Growth', decimals: 0 },
    { value: 7268, suffix: '+', label: 'Verified Tools' },
    { value: metrics.totalServers, suffix: '+', label: 'MCP Servers' },
    { value: metrics.totalUsers, suffix: '+', label: 'Active Developers' },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <section ref={ref} className="py-20 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-electric-cyan/5 to-transparent" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-bold mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple">
              {t('trust.title')}
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('trust.subtitle')}
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-electric-cyan/10 to-neon-purple/10 blur-xl" />
              <div className="relative bg-background/50 backdrop-blur-sm border border-border/50 rounded-lg p-6 text-center hover:border-electric-cyan/50 transition-colors">
                <AnimatedMetric
                  value={stat.value}
                  suffix={stat.suffix}
                  label={stat.label}
                  decimals={stat.decimals}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Certifications */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-2 md:grid-cols-4 gap-6"
        >
          {certifications.map((cert, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group"
            >
              <div className="relative overflow-hidden rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm p-6 text-center hover:border-electric-cyan/50 transition-all">
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-electric-cyan/20 to-transparent rounded-full blur-2xl group-hover:scale-150 transition-transform" />
                <cert.icon className="w-12 h-12 mx-auto mb-3 text-electric-cyan" />
                <h3 className="font-semibold mb-1">{t(`trust.certifications.${cert.key}.label`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`trust.certifications.${cert.key}.description`)}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}