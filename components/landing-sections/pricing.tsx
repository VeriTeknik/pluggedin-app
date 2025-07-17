'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
    <section id="pricing" className="py-12 sm:py-16 md:py-20 lg:py-24 xl:py-32">
              <div className="container px-4 sm:px-6 lg:px-8 mx-auto">
        <div className="max-w-2xl mx-auto mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('pricing.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('pricing.subtitle')}
          </p>
        </div>

        <motion.div
          className="grid max-w-6xl grid-cols-1 mx-auto gap-8 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {plans.map((plan) => (
            <motion.div key={plan.key} variants={itemVariants}>
              <Card className={`relative flex flex-col min-h-[500px] ${plan.recommended ? 'ring-2 ring-primary' : ''}`}>
                {plan.recommended && (
                  <Badge className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-0.5">
                    Most Popular
                  </Badge>
                )}
                <CardHeader className="flex-none text-center pb-6">
                  <CardTitle className="text-2xl mb-3">
                    {t(`pricing.${plan.key}.title`)}
                  </CardTitle>
                  <CardDescription className="text-sm min-h-[40px]">
                    {t(`pricing.${plan.key}.description`)}
                  </CardDescription>
                  <div className="flex items-baseline justify-center gap-1 mt-4">
                    <span className="text-4xl font-bold tracking-tight">
                      {t(`pricing.${plan.key}.price`)}
                    </span>
                    <span className="text-muted-foreground">
                      {t(`pricing.${plan.key}.period`)}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col flex-grow px-6">
                  <ul className="flex-grow space-y-4 mb-6">
                    {t(`pricing.${plan.key}.features`, { returnObjects: true }).map((feature: string, index: number) => (
                      <li key={index} className="flex items-start">
                        <Check className="w-5 h-5 mr-3 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button 
                    asChild 
                    className="w-full mt-auto"
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