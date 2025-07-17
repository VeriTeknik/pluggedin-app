'use client';

import { motion } from 'framer-motion';
import { 
  Bell,
  Blocks, 
  Box, 
  Database,
  Globe, 
  Search, 
  Share2, 
  Shield,
  TerminalSquare} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Define feature data structure
interface Feature {
  icon: React.ElementType;
  titleKey: string;
  descriptionKey: string;
}

// Feature data with all 9 major features
const features: Feature[] = [
  {
    icon: Share2,
    titleKey: 'features.communitySharing.title',
    descriptionKey: 'features.communitySharing.description'
  },
  {
    icon: Blocks,
    titleKey: 'features.collectionManagement.title',
    descriptionKey: 'features.collectionManagement.description'
  },
  {
    icon: Box,
    titleKey: 'features.workspaceOrganization.title',
    descriptionKey: 'features.workspaceOrganization.description'
  },
  {
    icon: Search,
    titleKey: 'features.advancedSearch.title',
    descriptionKey: 'features.advancedSearch.description'
  },
  {
    icon: TerminalSquare,
    titleKey: 'features.mcpPlayground.title',
    descriptionKey: 'features.mcpPlayground.description'
  },
  {
    icon: Database,
    titleKey: 'features.ragIntegration.title',
    descriptionKey: 'features.ragIntegration.description'
  },
  {
    icon: Bell,
    titleKey: 'features.notifications.title',
    descriptionKey: 'features.notifications.description'
  },
  {
    icon: Shield,
    titleKey: 'features.security.title',
    descriptionKey: 'features.security.description'
  },
  {
    icon: Globe,
    titleKey: 'features.internationalization.title',
    descriptionKey: 'features.internationalization.description'
  }
];

// Animation variants for staggering
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1, // Stagger delay between children
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

// Feature Card Component
function FeatureCard({ icon: Icon, titleKey, descriptionKey }: Feature) {
  const { t } = useTranslation('landing');
  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-lg transition-shadow duration-300 border border-border/40">
        <CardHeader className="pb-3">
          <div className="mb-3 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <CardTitle className="text-lg sm:text-xl leading-tight">{t(titleKey)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {t(descriptionKey)}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Main Features Overview Section Component
export function LandingFeaturesOverview() {
  const { t } = useTranslation('landing');

  return (
    <section id="features" className="py-12 sm:py-16 md:py-20 lg:py-24 xl:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 sm:mb-10 lg:mb-12 text-center max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl leading-tight">
            {t('features.sectionTitle')}
          </h2>
          <p className="mt-3 sm:mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed px-4">
            {t('features.sectionSubtitle')}
          </p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }} // Trigger animation when 20% is visible
        >
          {features.map((feature) => (
            <FeatureCard key={feature.titleKey} {...feature} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
