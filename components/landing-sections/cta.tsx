'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Rocket } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

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
  const { t } = useTranslation(); // Use default hook

  return (
    <motion.section
      id="cta"
      className="py-16 md:py-24 lg:py-32 relative overflow-hidden bg-gradient-to-t from-muted/50 to-background"
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
        className="container mx-auto px-4 text-center max-w-3xl"
        variants={contentVariants}
      >
        <Rocket className="h-12 w-12 mx-auto mb-4 text-primary" />
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
          {t('cta.title', 'Ready to Supercharge Your MCP Workflow?')} {/* Use relative key */}
        </h2>
        <p className="text-lg text-muted-foreground mb-8">
          {t('cta.subtitle', 'Join the Plugged.in community today. Manage, share, and discover MCP servers like never before.')} {/* Use relative key */}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            {/* TODO: Update href to actual signup/app page */}
            <Link href="/login">
              {t('cta.primaryAction', 'Get Started for Free')} {/* Use relative key */}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            {/* TODO: Update href to docs or contact page */}
            <Link href="/docs">
              {t('cta.secondaryAction', 'Read Documentation')} {/* Use relative key */}
            </Link>
          </Button>
        </div>
      </motion.div>
    </motion.section>
  );
}
