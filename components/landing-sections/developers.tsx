'use client';

import { motion } from 'framer-motion';
import { 
  BookOpen, 
  Code2, 
  Github, 
  MessageSquare,
  Puzzle, 
  Terminal
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DeveloperFeature {
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
}

const developerFeatures: DeveloperFeature[] = [
  {
    icon: Github,
    titleKey: 'developers.features.opensource.title',
    descKey: 'developers.features.opensource.desc'
  },
  {
    icon: Code2,
    titleKey: 'developers.features.apis.title',
    descKey: 'developers.features.apis.desc'
  },
  {
    icon: Terminal,
    titleKey: 'developers.features.sdks.title',
    descKey: 'developers.features.sdks.desc'
  },
  {
    icon: Puzzle,
    titleKey: 'developers.features.extensibility.title',
    descKey: 'developers.features.extensibility.desc'
  },
  {
    icon: BookOpen,
    titleKey: 'developers.features.documentation.title',
    descKey: 'developers.features.documentation.desc'
  },
  {
    icon: MessageSquare,
    titleKey: 'developers.features.community.title',
    descKey: 'developers.features.community.desc'
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

export function LandingDevelopersSection() {
  const { t } = useTranslation('landing');

  const codeExample = `npx -y @pluggedin/mcp-proxy@latest \\
  --pluggedin-api-key YOUR_API_KEY`;

  return (
    <section id="developers" className="py-16 md:py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('developers.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('developers.subtitle')}
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            {t('developers.description')}
          </p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {developerFeatures.map((feature) => (
            <motion.div key={feature.titleKey} variants={itemVariants}>
              <Card className="h-full hover:shadow-lg transition-shadow duration-300">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
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

        <div className="mt-16 max-w-2xl mx-auto">
          <h3 className="text-xl font-semibold mb-2 text-center">
            {t('developers.codeExample.title')}
          </h3>
          <p className="text-sm text-muted-foreground mb-4 text-center">
            {t('developers.codeExample.description')}
          </p>
          <div className="relative">
            <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{codeExample}</code>
            </pre>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg">
            <Link href="/docs">
              {t('developers.action')}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}