'use client';

import { motion } from 'framer-motion';
import { Shield, Lock, Award, CheckCircle2, Star } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { AnimatedMetric } from '@/components/ui/animated-metric';
import { cn } from '@/lib/utils';

const certifications = [
  { icon: Shield, label: 'SOC 2 Type II', description: 'Certified' },
  { icon: Lock, label: 'ISO 27001', description: 'Compliant' },
  { icon: Award, label: 'GDPR', description: 'Compliant' },
  { icon: CheckCircle2, label: 'HIPAA', description: 'Ready' },
];

const stats = [
  { value: 718, suffix: '%', label: 'Monthly Growth', decimals: 0 },
  { value: 7268, suffix: '+', label: 'Verified Tools' },
  { value: 1500, suffix: '+', label: 'MCP Servers' },
  { value: 620, suffix: '+', label: 'Active Developers' },
];

export function TrustIndicatorsSection() {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

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
              Enterprise Trust & Security
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Join thousands of organizations that trust Plugged.in with their critical AI infrastructure
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
                <h3 className="font-semibold mb-1">{cert.label}</h3>
                <p className="text-sm text-muted-foreground">{cert.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Growth Story */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-20 pt-10 border-t border-border/20"
        >
          <div className="text-center max-w-3xl mx-auto">
            <h3 className="text-2xl font-bold mb-4">
              From 0 to 14,000+ API calls in just 30 days
            </h3>
            <p className="text-muted-foreground mb-8">
              Join 620+ developers building the future with the fastest-growing AI integration platform
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-glow-green animate-pulse" />
                <span className="text-sm">87+ AI Documents</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-electric-cyan animate-pulse" />
                <span className="text-sm">460 Active Servers</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-neon-purple animate-pulse" />
                <span className="text-sm">650+ Projects Created</span>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}