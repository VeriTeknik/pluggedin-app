'use client';

import { motion } from 'framer-motion';
import {
  BookOpen,
  FileText,
  Key,
  Package,
  PlayCircle,
  Plug,
  Terminal,
  UserPlus,
  Rocket,
  TrendingUp,
  Clock
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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

export function LandingGettingStartedSection() {
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const steps = [
    { icon: UserPlus, key: 'step1', metric: '< 30 seconds' },
    { icon: Key, key: 'step2', metric: 'Keys encrypted' },
    { icon: Terminal, key: 'step3', metric: '7,268+ verified' },
    { icon: Plug, key: 'step4', metric: 'No config exposure' }
  ];

  const resources = [
    { icon: PlayCircle, key: 'quickstart', stat: '620+ developers started here' },
    { icon: BookOpen, key: 'tutorials', stat: '87+ AI documents' },
    { icon: FileText, key: 'videos', stat: '460+ active servers' },
    { icon: Package, key: 'examples', stat: '650+ projects created' }
  ];

  return (
    <section ref={ref} id="getting-started" className="py-12 sm:py-16 md:py-20 lg:py-24 xl:py-32 bg-gradient-to-b from-muted/30 via-background to-muted/30 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#a855f708_1px,transparent_1px),linear-gradient(to_bottom,#a855f708_1px,transparent_1px)] bg-[size:60px_60px]" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-glow-green/10 border border-glow-green/20 mb-4">
            <Rocket className="h-4 w-4 text-glow-green" />
            <span className="text-sm font-semibold text-glow-green">Join 620+ Developers in Minutes</span>
          </motion.div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-electric-cyan">
              {t('gettingStarted.title')}
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            7,268+ verified tools with encrypted keys and 1,500+ MCP servers
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            From signup to first API call in under 60 seconds
          </p>
        </div>

        {/* Steps */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {steps.map((step, index) => (
            <motion.div key={step.key} variants={itemVariants} whileHover={{ scale: 1.02, y: -5 }}>
              <Card className={cn(
                "h-full transition-all duration-300 group",
                "border border-border/40 hover:border-neon-purple/50",
                "bg-background/50 backdrop-blur-sm",
                "hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]"
              )}>
                <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                <CardHeader className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple/10 to-electric-cyan/10 text-neon-purple group-hover:from-neon-purple/20 group-hover:to-electric-cyan/20 transition-colors">
                      <step.icon className="h-5 w-5" />
                    </div>
                    <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-electric-cyan">
                      {index + 1}
                    </span>
                  </div>
                  <CardTitle className="text-lg">
                    {t(`gettingStarted.steps.${step.key}.title`)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <p className="text-sm text-muted-foreground mb-2">
                    {t(`gettingStarted.steps.${step.key}.desc`)}
                  </p>
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-electric-cyan/10 border border-electric-cyan/20">
                    <Clock className="h-3 w-3 text-electric-cyan" />
                    <span className="text-xs font-semibold text-electric-cyan">{step.metric}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Resources */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.4 }}
          className="max-w-4xl mx-auto">
          <h3 className="text-xl font-semibold mb-6 text-center">
            {t('gettingStarted.resources.title')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {resources.map((resource) => (
              <Card
                key={resource.key}
                className="hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all hover:border-electric-cyan/50 bg-background/50 backdrop-blur-sm group">
                <CardContent className="p-4">
                  <div className="flex items-center mb-2">
                    <resource.icon className="h-5 w-5 text-electric-cyan mr-3" />
                    <span className="text-sm font-medium">
                      {t(`gettingStarted.resources.${resource.key}`)}
                    </span>
                  </div>
                  <span className="text-xs text-electric-cyan/80 font-semibold">
                    {resource.stat}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6 }}
          className="text-center">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-glow-green/10 border border-glow-green/20">
              <TrendingUp className="h-3 w-3 text-glow-green" />
              <span className="text-xs font-semibold text-glow-green">718% Monthly Growth</span>
            </div>
          </div>
          <Button
            asChild
            size="lg"
            className="bg-gradient-to-r from-neon-purple to-electric-cyan hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all duration-300">
            <a href="/setup-guide">
              {t('gettingStarted.action')}
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}