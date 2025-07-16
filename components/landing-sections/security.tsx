'use client';

import { motion } from 'framer-motion';
import { 
  Database, 
  FileCheck, 
  Key, 
  Lock, 
  Server, 
  Shield} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SecurityFeature {
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
}

const securityFeatures: SecurityFeature[] = [
  {
    icon: Key,
    titleKey: 'security.features.authentication.title',
    descKey: 'security.features.authentication.desc'
  },
  {
    icon: Shield,
    titleKey: 'security.features.sandboxing.title',
    descKey: 'security.features.sandboxing.desc'
  },
  {
    icon: Lock,
    titleKey: 'security.features.isolation.title',
    descKey: 'security.features.isolation.desc'
  },
  {
    icon: FileCheck,
    titleKey: 'security.features.audit.title',
    descKey: 'security.features.audit.desc'
  },
  {
    icon: Database,
    titleKey: 'security.features.encryption.title',
    descKey: 'security.features.encryption.desc'
  },
  {
    icon: Server,
    titleKey: 'security.features.selfhost.title',
    descKey: 'security.features.selfhost.desc'
  }
];

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

export function LandingSecuritySection() {
  const { t } = useTranslation('landing');

  return (
    <section id="security" className="py-12 sm:py-16 md:py-20 lg:py-24 xl:py-32">
              <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('security.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('security.subtitle')}
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            {t('security.description')}
          </p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {securityFeatures.map((feature) => (
            <motion.div key={feature.titleKey} variants={itemVariants}>
              <Card className="h-full hover:shadow-lg transition-shadow duration-300">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg">{t(feature.titleKey)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(feature.descKey)}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground mb-6">
            {t('security.compliance')}
          </p>
          <Button asChild>
            <a href="/docs/security">
              {t('security.action')}
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}