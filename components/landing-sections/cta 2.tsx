'use client';

import { ArrowRight, Play } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function CallToAction() {
  const { t } = useTranslation();

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      {/* Animated grid lines */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <Card className="max-w-5xl mx-auto overflow-hidden">
          <div className="relative p-8 md:p-12">
            {/* Background glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent opacity-50" />
            
            <div className="relative z-10">
              <div className="text-center max-w-3xl mx-auto">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  {t('landing.cta.title')}
                </h2>
                <p className="text-xl text-muted-foreground mb-8">
                  {t('landing.cta.subtitle')}
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button size="lg" asChild>
                    <Link href="/auth/signup">
                      {t('landing.cta.primary')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/demo">
                      <Play className="mr-2 h-4 w-4" />
                      {t('landing.cta.secondary')}
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Workflow Diagram */}
              <div className="mt-12 relative">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className="text-center relative"
                    >
                      {/* Connector line */}
                      {step < 3 && (
                        <div className="hidden md:block absolute top-1/2 left-full w-full h-px bg-border -translate-y-1/2 transform" />
                      )}
                      
                      {/* Step circle */}
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <span className="text-lg font-semibold text-primary">
                          {step}
                        </span>
                      </div>
                      
                      {/* Step content */}
                      <h4 className="font-medium mb-2">
                        {t(`landing.cta.step${step}.title`)}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t(`landing.cta.step${step}.description`)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}