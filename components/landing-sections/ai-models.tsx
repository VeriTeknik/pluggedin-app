'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Brain, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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

// AI model logos - using text placeholders for now
const aiModels = [
  { name: 'Claude', icon: '🤖', color: 'from-orange-500 to-orange-600' },
  { name: 'GPT-4', icon: '🧠', color: 'from-green-500 to-green-600' },
  { name: 'Llama', icon: '🦙', color: 'from-purple-500 to-purple-600' },
  { name: 'Gemini', icon: '✨', color: 'from-blue-500 to-blue-600' },
  { name: 'Mistral', icon: '🌊', color: 'from-cyan-500 to-cyan-600' },
  { name: 'Qwen', icon: '🌟', color: 'from-pink-500 to-pink-600' },
];

export function LandingAiModelsSection() {
  const { t } = useTranslation('landing');

  return (
    <section id="ai-models" className="py-16 md:py-24 lg:py-32">
      <div className="container mx-auto px-4">
        <motion.div
          className="max-w-6xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {/* Header */}
          <motion.div className="text-center mb-12" variants={itemVariants}>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium mb-4">
              <Sparkles className="h-4 w-4" />
              {t('aiModels.badge')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              {t('aiModels.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('aiModels.subtitle')}
            </p>
          </motion.div>

          {/* AI Models Grid */}
          <motion.div variants={itemVariants} className="mb-12">
            <Card className="border-2 border-primary/10">
              <CardContent className="p-8">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8">
                  {aiModels.map((model) => (
                    <div
                      key={model.name}
                      className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className={`text-4xl mb-2 bg-gradient-to-br ${model.color} bg-clip-text text-transparent`}>
                        {model.icon}
                      </div>
                      <span className="text-sm font-medium">{model.name}</span>
                    </div>
                  ))}
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('aiModels.moreModels')}
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/mcp-playground">
                      {t('aiModels.viewAll')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Features */}
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
            variants={containerVariants}
          >
            <motion.div variants={itemVariants}>
              <Card className="h-full">
                <CardContent className="p-6">
                  <Brain className="h-10 w-10 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">{t('aiModels.feature1.title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('aiModels.feature1.description')}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card className="h-full">
                <CardContent className="p-6">
                  <Brain className="h-10 w-10 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">{t('aiModels.feature2.title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('aiModels.feature2.description')}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card className="h-full">
                <CardContent className="p-6">
                  <Brain className="h-10 w-10 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">{t('aiModels.feature3.title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('aiModels.feature3.description')}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          {/* CTA */}
          <motion.div variants={itemVariants} className="text-center mt-12">
            <p className="text-lg font-semibold mb-4">
              {t('aiModels.cta.title')}
            </p>
            <Button asChild size="lg">
              <Link href="/mcp-playground">
                {t('aiModels.cta.button')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}