'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Check, Rocket, Shield } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// Animation variants
const sectionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const contentVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.5, delay: 0.2 } },
};

export function LandingCta() {
  const { t } = useTranslation('landing');

  return (
    <motion.section
      id="cta"
      className="py-12 sm:py-16 md:py-20 lg:py-24 xl:py-32 relative overflow-hidden bg-gradient-to-t from-muted/50 to-background"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
    >
      {/* Placeholder for subtle background animation */}
      <div className="absolute inset-0 -z-10 opacity-10">
        {/* Example: subtle pattern or gradient animation */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8881_1px,transparent_1px),linear-gradient(to_bottom,#8881_1px,transparent_1px)] bg-[size:30px_30px] [mask-image:radial-gradient(ellipse_100%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
      </div>

      <motion.div
        className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-3xl"
        variants={contentVariants}
      >
        <Rocket className="h-12 w-12 mx-auto mb-4 text-primary" />
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
          {t('cta.title')}
        </h2>
        <p className="text-lg text-muted-foreground mb-4">
          {t('cta.subtitle')}
        </p>
        <p className="text-base text-muted-foreground mb-8">
          {t('cta.description')}
        </p>
        
        {/* Features List */}
        <Card className="mb-8 max-w-md mx-auto">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">{t('cta.features.title')}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-start">
                  <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span>{t(`cta.features.feature${i}`)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href="/register">
              {t('cta.primaryAction')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/docs">
              {t('cta.secondaryAction')}
            </Link>
          </Button>
        </div>
        
        {/* Security Note */}
        <div className="mt-8 p-4 bg-muted/50 rounded-lg max-w-2xl mx-auto">
          <div className="flex items-start">
            <Shield className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-semibold mb-1">{t('cta.security.title')}</p>
              <p>{t('cta.security.description')}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.section>
  );
}
