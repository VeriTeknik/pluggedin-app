'use client';

import { motion } from 'framer-motion';
import { BookOpen, Code2, Edit3, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const setupGuides = [
  {
    id: 'claudeDesktop',
    icon: Code2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    href: '/docs/guides/claude-desktop',
  },
  {
    id: 'claudeCode',
    icon: BookOpen,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    href: '/docs/guides/claude-code',
  },
  {
    id: 'cursor',
    icon: Edit3,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    href: '/docs/guides/cursor',
  },
  {
    id: 'smithery',
    icon: ExternalLink,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    href: '/docs/guides/smithery',
  },
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

export default function GuidesPage() {
  const { t } = useTranslation('guides');

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t('description')}
        </p>
      </div>

      {/* Benefits Section */}
      <div className="mb-12 p-6 bg-card dark:bg-muted rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">{t('benefits.title')}</h2>
        <p className="mb-4 text-muted-foreground">
          {t('benefits.description')}
        </p>
        <ul className="list-disc list-inside space-y-2 text-muted-foreground">
          {(t('benefits.items', { returnObjects: true }) as string[]).map((benefit: string, index: number) => (
            <li key={index}>{benefit}</li>
          ))}
        </ul>
      </div>

      {/* Setup Guides Grid */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {setupGuides.map((guide) => {
          const Icon = guide.icon;
          return (
            <motion.div key={guide.id} variants={itemVariants}>
              <Link href={guide.href}>
                <Card className="h-full hover:shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer">
                  <CardHeader>
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${guide.bgColor} mb-4`}>
                      <Icon className={`h-6 w-6 ${guide.color}`} />
                    </div>
                    <CardTitle className="text-xl">{t(`clients.${guide.id}.title`)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {t(`clients.${guide.id}.description`)}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

      {/* API Key Notice */}
      <div className="mt-12 p-4 bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 rounded-lg">
        <p className="font-medium">
          {t('apiKeyNotice')}{' '}
          <Link
            href="/api-keys"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            {t('apiKeysPage')}
          </Link>
        </p>
      </div>

      {/* Help Section */}
      <div className="mt-16 text-center bg-muted/30 rounded-lg p-8">
        <h3 className="text-xl font-semibold mb-4">{t('help.title')}</h3>
        <p className="text-muted-foreground mb-6">
          {t('help.description')}
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link 
            href="/setup-guide" 
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {t('help.completeGuide')}
          </Link>
          <Link 
            href="/legal/contact" 
            className="inline-flex items-center px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
          >
            {t('help.contactSupport')}
          </Link>
        </div>
      </div>
    </div>
  );
}