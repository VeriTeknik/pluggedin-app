'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Brain, Cloud, Database, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

  return (
    <section id="why-pluggedin" className="py-16 md:py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div
          className="max-w-4xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {/* Section Title */}
          <motion.div className="text-center mb-12" variants={itemVariants}>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              {t('whyPluggedin.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('whyPluggedin.subtitle')}
            </p>
          </motion.div>

          {/* The Problem */}
          <motion.div variants={itemVariants}>
            <Card className="mb-8 border-destructive/20 bg-destructive/5">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-destructive/10 p-3 text-destructive">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {t('whyPluggedin.problem.title')}
                    </h3>
                    <p className="text-muted-foreground">
                      {t('whyPluggedin.problem.description')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Our Solution */}
          <motion.div variants={itemVariants}>
            <Card className="mb-8 border-primary/20 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-3 text-primary">
                    <Database className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {t('whyPluggedin.solution.title')}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {t('whyPluggedin.solution.description')}
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-primary" />
                        <span>{t('whyPluggedin.solution.benefit1')}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-primary" />
                        <span>{t('whyPluggedin.solution.benefit2')}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-primary" />
                        <span>{t('whyPluggedin.solution.benefit3')}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-primary" />
                        <span>{t('whyPluggedin.solution.benefit4')}</span>
                      </li>
                    </ul>
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
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                    <Brain className="h-5 w-5" />
                    <span>Claude</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                    <Brain className="h-5 w-5" />
                    <span>GPT-4</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                    <Brain className="h-5 w-5" />
                    <span>Llama</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                    <Brain className="h-5 w-5" />
                    <span>Gemini</span>
                  </div>
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