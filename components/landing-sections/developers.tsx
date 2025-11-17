'use client';

import { motion } from 'framer-motion';
import {
  BookOpen,
  Code2,
  Github,
  MessageSquare,
  Puzzle,
  Rocket,
  Star,
  Terminal,
  TrendingUp,
  Users} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { AnimatedMetric } from '@/components/ui/animated-metric';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useMetrics } from '@/contexts/metrics-context';

interface DeveloperFeature {
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
}

const developerFeatures: DeveloperFeature[] = [
  {
    icon: Github,
    titleKey: 'developers.features.opensource.title',
    descKey: 'developers.features.opensource.desc'
  },
  {
    icon: Code2,
    titleKey: 'developers.features.apis.title',
    descKey: 'developers.features.apis.desc'
  },
  {
    icon: Terminal,
    titleKey: 'developers.features.sdks.title',
    descKey: 'developers.features.sdks.desc'
  },
  {
    icon: Puzzle,
    titleKey: 'developers.features.extensibility.title',
    descKey: 'developers.features.extensibility.desc'
  },
  {
    icon: BookOpen,
    titleKey: 'developers.features.documentation.title',
    descKey: 'developers.features.documentation.desc'
  },
  {
    icon: MessageSquare,
    titleKey: 'developers.features.community.title',
    descKey: 'developers.features.community.desc'
  }
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

export function LandingDevelopersSection() {
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  // Get metrics from shared context (cached, fetched once)
  const { metrics } = useMetrics();

  const communityStats = [
    { icon: Users, value: metrics.totalUsers, suffix: '+', label: 'Active Developers' },
    { icon: Star, value: metrics.totalProjects, suffix: '+', label: 'Projects Created' },
    { icon: Github, value: metrics.totalServers, suffix: '+', label: 'Active Servers' },
    { icon: Rocket, value: 87, suffix: '+', label: 'AI Documents' },
  ];

  const codeExample = `npx -y @pluggedin/pluggedin-mcp-proxy@latest \\
  --pluggedin-api-key YOUR_API_KEY`;

  return (
    <section ref={ref} id="developers" className="py-12 sm:py-16 md:py-20 lg:py-24 xl:py-32 bg-gradient-to-b from-muted/30 via-background to-muted/30 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#a855f708_1px,transparent_1px),linear-gradient(to_bottom,#a855f708_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Community Stats */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {communityStats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: index * 0.1 }}
              className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-neon-purple/10 text-neon-purple mb-2">
                <stat.icon className="w-5 h-5" />
              </div>
              <AnimatedMetric
                value={stat.value}
                suffix={stat.suffix}
                label={stat.label}
                decimals={0}
              />
            </motion.div>
          ))}
        </motion.div>

        <div className="mb-12 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-purple/10 border border-neon-purple/20 mb-4">
            <TrendingUp className="h-4 w-4 text-neon-purple" />
            <span className="text-sm font-semibold text-neon-purple">{metrics.totalUsers}+ Active Developers</span>
          </motion.div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-electric-cyan">
              {t('developers.title')}
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join the fastest-growing AI developer community
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            Build alongside {metrics.totalUsers}+ developers creating the future of AI integration
          </p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {developerFeatures.map((feature) => (
            <motion.div key={feature.titleKey} variants={itemVariants} whileHover={{ scale: 1.02, y: -5 }}>
              <Card className={cn(
                "h-full transition-all duration-300 group",
                "border border-border/40 hover:border-neon-purple/50",
                "bg-background/50 backdrop-blur-sm",
                "hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]"
              )}>
                <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                <CardHeader className="relative">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-neon-purple/10 to-electric-cyan/10 text-neon-purple group-hover:from-neon-purple/20 group-hover:to-electric-cyan/20 transition-colors">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg">{t(feature.titleKey)}</CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <p className="text-sm text-muted-foreground">
                    {t(feature.descKey)}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6 }}
          className="mt-16 max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-glow-green/10 border border-glow-green/20 mb-4">
              <Rocket className="h-3 w-3 text-glow-green" />
              <span className="text-xs font-semibold text-glow-green">Quick Start</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">
              Join {metrics.totalUsers}+ developers in seconds
            </h3>
            <p className="text-sm text-muted-foreground">
              Use 7,268+ verified tools with encrypted keys - no config exposure needed
            </p>
          </div>
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-neon-purple to-electric-cyan rounded-lg blur opacity-25 group-hover:opacity-50 transition-opacity" />
            <pre className="relative bg-zinc-950 text-zinc-100 p-6 rounded-lg overflow-x-auto text-sm border border-border/50">
              <code className="text-glow-green">{codeExample}</code>
            </pre>
          </div>
          <div className="mt-4 flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-glow-green animate-pulse" />
              <span>Live API</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-electric-cyan animate-pulse" />
              <span>99.9% Uptime</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-neon-purple animate-pulse" />
              <span>&lt;100ms Response</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8 }}
          className="mt-12 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Join {metrics.totalUsers}+ developers using 7,268+ verified tools with secure key management
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-neon-purple to-electric-cyan hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all duration-300">
              <a href="https://docs.plugged.in" target="_blank" rel="noopener noreferrer">
                {t('developers.action')}
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-neon-purple/20 hover:bg-neon-purple/10">
              <a href="https://github.com/veriteknik" target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-4 w-4" />
                View on GitHub
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}