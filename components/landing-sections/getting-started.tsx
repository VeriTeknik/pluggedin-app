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
  UserPlus} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

  const steps = [
    { icon: UserPlus, key: 'step1' },
    { icon: Key, key: 'step2' },
    { icon: Terminal, key: 'step3' },
    { icon: Plug, key: 'step4' }
  ];

  const resources = [
    { icon: PlayCircle, key: 'quickstart' },
    { icon: BookOpen, key: 'tutorials' },
    { icon: FileText, key: 'videos' },
    { icon: Package, key: 'examples' }
  ];

  return (
    <section id="getting-started" className="py-16 md:py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('gettingStarted.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('gettingStarted.subtitle')}
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            {t('gettingStarted.description')}
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
            <motion.div key={step.key} variants={itemVariants}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <step.icon className="h-5 w-5" />
                    </div>
                    <span className="text-2xl font-bold text-muted-foreground">{index + 1}</span>
                  </div>
                  <CardTitle className="text-lg">
                    {t(`gettingStarted.steps.${step.key}.title`)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(`gettingStarted.steps.${step.key}.desc`)}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Resources */}
        <div className="max-w-4xl mx-auto">
          <h3 className="text-xl font-semibold mb-6 text-center">
            {t('gettingStarted.resources.title')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {resources.map((resource) => (
              <Card key={resource.key} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4 flex items-center">
                  <resource.icon className="h-5 w-5 text-primary mr-3" />
                  <span className="text-sm font-medium">
                    {t(`gettingStarted.resources.${resource.key}`)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="text-center">
          <Button asChild size="lg">
            <a href="/setup-guide">
              {t('gettingStarted.action')}
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}