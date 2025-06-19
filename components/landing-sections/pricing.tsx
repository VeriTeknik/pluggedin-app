'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription,CardHeader, CardTitle } from '@/components/ui/card';

interface PricingPlan {
  key: 'free' | 'pro' | 'enterprise';
  recommended?: boolean;
}

const plans: PricingPlan[] = [
  { key: 'free' },
  { key: 'pro', recommended: true },
  { key: 'enterprise' }
];

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

  return (
    <section id="pricing" className="py-16 md:py-24 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('pricing.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('pricing.subtitle')}
          </p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-8 lg:grid-cols-3 max-w-6xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {plans.map((plan) => (
            <motion.div key={plan.key} variants={itemVariants}>
              <Card className={`h-full relative ${plan.recommended ? 'ring-2 ring-primary' : ''}`}>
                {plan.recommended && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Most Popular
                  </Badge>
                )}
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl">{t(`pricing.${plan.key}.title`)}</CardTitle>
                  <CardDescription className="mt-2">
                    {t(`pricing.${plan.key}.description`)}
                  </CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{t(`pricing.${plan.key}.price`)}</span>
                    <span className="text-muted-foreground">{t(`pricing.${plan.key}.period`)}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col h-full">
                  <ul className="space-y-3 mb-8 flex-grow">
                    {t(`pricing.${plan.key}.features`, { returnObjects: true }).map((feature: string, index: number) => (
                      <li key={index} className="flex items-start">
                        <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button 
                    asChild 
                    className="w-full" 
                    variant={plan.recommended ? 'default' : 'outline'}
                  >
                    <a href={plan.key === 'enterprise' ? '/contact' : '/register'}>
                      {t(`pricing.${plan.key}.cta`)}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}