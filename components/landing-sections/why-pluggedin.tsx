'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Brain, CheckCircle,Cloud, Database, Layers, Lock, TrendingUp, Users, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { AnimatedMetric } from '@/components/ui/animated-metric';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
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

export function LandingWhyPluggedin() {
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const metrics = [
    { icon: TrendingUp, value: 718, suffix: '%', label: 'Monthly Growth', color: 'text-glow-green' },
    { icon: Layers, value: 7268, suffix: '+', label: 'Verified Tools', color: 'text-electric-cyan' },
    { icon: Users, value: 620, suffix: '+', label: 'Active Developers', color: 'text-neon-purple' },
    { icon: Zap, value: 14000, suffix: '+', label: 'API Calls/Month', color: 'text-electric-cyan' },
  ];

  return (
    <section ref={ref} id="why-pluggedin" className="py-16 md:py-24 lg:py-32 bg-gradient-to-b from-muted/30 via-background to-muted/30 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#06b6d408_1px,transparent_1px),linear-gradient(to_bottom,#06b6d408_1px,transparent_1px)] bg-[size:30px_30px]" />
      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          className="max-w-5xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {/* Metrics Bar */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {metrics.map((metric, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: index * 0.1 }}
                className="text-center group">
                <div className={cn(
                  "inline-flex items-center justify-center w-10 h-10 rounded-lg mb-2",
                  "bg-gradient-to-br from-electric-cyan/10 to-neon-purple/10",
                  "group-hover:from-electric-cyan/20 group-hover:to-neon-purple/20 transition-colors"
                )}>
                  <metric.icon className={cn("w-5 h-5", metric.color)} />
                </div>
                <AnimatedMetric
                  value={metric.value}
                  suffix={metric.suffix}
                  label={metric.label}
                  decimals={0}
                />
              </motion.div>
            ))}
          </motion.div>

          {/* Section Title */}
          <motion.div className="text-center mb-12" variants={itemVariants}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-glow-green/10 border border-glow-green/20 mb-4">
              <CheckCircle className="h-4 w-4 text-glow-green" />
              <span className="text-sm font-semibold text-glow-green">Proven Growth Platform</span>
            </motion.div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple">
                {t('whyPluggedin.title')}
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Join 620+ developers who chose the fastest-growing AI platform
            </p>
          </motion.div>

          {/* The Problem */}
          <motion.div variants={itemVariants}>
            <Card className="mb-8 border-destructive/20 bg-gradient-to-br from-destructive/5 to-transparent backdrop-blur-sm hover:shadow-[0_0_30px_rgba(239,68,68,0.1)] transition-all">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-destructive/10 p-3 text-destructive">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {t('whyPluggedin.problem.title')}
                    </h3>
                    <p className="text-muted-foreground mb-3">
                      {t('whyPluggedin.problem.description')}
                    </p>
                    <div className="text-sm text-muted-foreground/80 italic">
                      "Before Plugged.in, we were managing 50+ separate AI integrations. It was chaos."
                      <span className="block mt-1 not-italic">- CTO, Series B Startup</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Our Solution */}
          <motion.div variants={itemVariants}>
            <Card className="mb-8 border-electric-cyan/20 bg-gradient-to-br from-electric-cyan/5 to-neon-purple/5 backdrop-blur-sm hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] transition-all">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-gradient-to-br from-electric-cyan/10 to-neon-purple/10 p-3 text-electric-cyan">
                    <Database className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {t('whyPluggedin.solution.title')}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      7,268+ verified tools with encrypted keys and 1,500+ MCP servers - all managed securely
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-glow-green mt-0.5" />
                        <div>
                          <span className="font-semibold">7,268+ Verified Tools</span>
                          <p className="text-xs text-muted-foreground">Keys encrypted - no config exposure</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-glow-green mt-0.5" />
                        <div>
                          <span className="font-semibold">99.9% Uptime</span>
                          <p className="text-xs text-muted-foreground">Enterprise SLA</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-glow-green mt-0.5" />
                        <div>
                          <span className="font-semibold">&lt;100ms Response</span>
                          <p className="text-xs text-muted-foreground">Lightning fast</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-glow-green mt-0.5" />
                        <div>
                          <span className="font-semibold">620+ Developers</span>
                          <p className="text-xs text-muted-foreground">Growing daily</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 bg-glow-green/5 border border-glow-green/20 rounded-lg">
                      <p className="text-sm font-semibold text-glow-green mb-1">718% Monthly Growth</p>
                      <p className="text-xs text-muted-foreground">
                        From 0 to 14,000+ API calls in just 30 days
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* The Bridge - MCP */}
          <motion.div variants={itemVariants}>
            <Card className="mb-8">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-secondary/10 p-3 text-secondary-foreground">
                    <Lock className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {t('whyPluggedin.bridge.title')}
                    </h3>
                    <p className="text-muted-foreground">
                      {t('whyPluggedin.bridge.description')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Visual Diagram */}
          <motion.div variants={itemVariants} className="mt-12">
            <div className="relative rounded-lg border bg-card p-8">
              <div className="flex flex-col items-center justify-center space-y-8">
                {/* AI Models */}
                <div className="flex flex-wrap justify-center gap-4">
                  {[
                    { key: 'whyPluggedin.aiModels.claude', name: 'Claude' },
                    { key: 'whyPluggedin.aiModels.gpt4', name: 'GPT-4' },
                    { key: 'whyPluggedin.aiModels.llama', name: 'Llama' },
                    { key: 'whyPluggedin.aiModels.gemini', name: 'Gemini' }
                  ].map((model) => (
                    <div key={model.key} className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                      <Brain className="h-5 w-5" />
                      <span>{t(model.key) || model.name}</span>
                    </div>
                  ))}
                </div>
                
                {/* Arrow Down */}
                <div className="flex flex-col items-center">
                  <div className="h-8 w-0.5 bg-primary" />
                  <ArrowRight className="h-6 w-6 rotate-90 text-primary" />
                </div>
                
                {/* Plugged.in Hub */}
                <div className="rounded-lg border-2 border-primary bg-primary/10 px-8 py-4">
                  <p className="text-lg font-semibold">{t('whyPluggedin.visual.hub')}</p>
                  <p className="text-sm text-muted-foreground">{t('whyPluggedin.visual.hubDesc')}</p>
                </div>
                
                {/* Arrow Down */}
                <div className="flex flex-col items-center">
                  <ArrowRight className="h-6 w-6 rotate-90 text-primary" />
                  <div className="h-8 w-0.5 bg-primary" />
                </div>
                
                {/* Your Data */}
                <div className="rounded-lg border-2 border-green-600 bg-green-600/10 px-8 py-4">
                  <p className="text-lg font-semibold">{t('whyPluggedin.visual.yourData')}</p>
                  <p className="text-sm text-muted-foreground">{t('whyPluggedin.visual.yourDataDesc')}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Call to Action */}
          <motion.div variants={itemVariants} className="mt-12 text-center">
            <p className="text-lg font-semibold text-primary mb-2">
              {t('whyPluggedin.cta.title')}
            </p>
            <p className="text-muted-foreground">
              {t('whyPluggedin.cta.subtitle')}
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}