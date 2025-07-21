'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Check, Gift, Heart, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
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

export function LandingPricingSection() {
  const { t } = useTranslation('landing');

  const features = [
    'pricing.features.unlimited_ai_model_connections',
    'pricing.features.full_data_ownership_and_export',
    'pricing.features.mcp_server_integrations',
    'pricing.features.unlimited_workspaces_and_projects',
    'pricing.features.community_sharing_and_collaboration',
    'pricing.features.end_to_end_encryption',
    'pricing.features.rag_document_storage',
    'pricing.features.real_time_notifications',
    'pricing.features.oauth_authentication',
    'pricing.features.api_access'
  ];

  return (
    <section id="pricing" className="py-16 md:py-24 lg:py-32 bg-muted/30">
      <div className="container px-4 mx-auto">
        <motion.div 
          className="max-w-4xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {/* Header */}
          <motion.div className="text-center mb-12" variants={itemVariants}>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium mb-4">
              <Gift className="h-4 w-4" />
              {t('pricing.badge')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              {t('pricing.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('pricing.subtitle')}
            </p>
          </motion.div>

          {/* Free Forever Card */}
          <motion.div variants={itemVariants}>
            <Card className="border-2 border-primary/20 shadow-lg">
              <CardHeader className="text-center pb-8">
                <div className="mb-4">
                  <Heart className="h-12 w-12 mx-auto text-primary" />
                </div>
                <CardTitle className="text-2xl mb-4">
                  {t('pricing.free.title')}
                </CardTitle>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-5xl font-bold">$0</span>
                  <span className="text-muted-foreground">forever</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('pricing.free.description')}
                </p>
              </CardHeader>
              
              <CardContent>
                <div className="mb-8">
                  <h4 className="font-semibold mb-4 text-center">{t('pricing.free.everything_included')}</h4>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{t(feature)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  <Button asChild size="lg" className="w-full">
                    <Link href="/register">
                      {t('pricing.free.cta')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  
                  <div className="text-center text-sm text-muted-foreground">
                    <p>{t('pricing.free.note')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Why Free */}
          <motion.div variants={itemVariants} className="mt-12">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Zap className="h-8 w-8 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2">{t('pricing.whyFree.title')}</h3>
                    <p className="text-muted-foreground">
                      {t('pricing.whyFree.description')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}