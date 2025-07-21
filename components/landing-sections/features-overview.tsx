'use client';

import { motion } from 'framer-motion';
import { 
  Blocks, 
  Box, 
  Brain,
  Clock,
  Database,
  Key,
  Lock,
  Package,
  Share2, 
  Shield,
  TrendingUp} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Define feature data structure
interface Feature {
  icon: React.ElementType;
  titleKey: string;
  descriptionKey: string;
  comingSoon?: boolean;
}

// Feature data organized by priority - data ownership first
const features: Feature[] = [
  // Data Ownership Features (Priority)
  {
    icon: Brain,
    titleKey: 'features.universalAiHub.title',
    descriptionKey: 'features.universalAiHub.description'
  },
  {
    icon: Shield,
    titleKey: 'features.dataSovereignty.title',
    descriptionKey: 'features.dataSovereignty.description'
  },
  {
    icon: Database,
    titleKey: 'features.aiAssetManagement.title',
    descriptionKey: 'features.aiAssetManagement.description'
  },
  {
    icon: Clock,
    titleKey: 'features.crossModelMemory.title',
    descriptionKey: 'features.crossModelMemory.description',
    comingSoon: true
  },
  // Technical Features
  {
    icon: Package,
    titleKey: 'features.mcpRegistry.title',
    descriptionKey: 'features.mcpRegistry.description'
  },
  {
    icon: Lock,
    titleKey: 'features.endToEndEncryption.title',
    descriptionKey: 'features.endToEndEncryption.description'
  },
  {
    icon: TrendingUp,
    titleKey: 'features.trendingAnalytics.title',
    descriptionKey: 'features.trendingAnalytics.description'
  },
  {
    icon: Key,
    titleKey: 'features.oauthTokenManagement.title',
    descriptionKey: 'features.oauthTokenManagement.description'
  },
  // Community Features
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
    icon: Database,
    titleKey: 'features.ragIntegration.title',
    descriptionKey: 'features.ragIntegration.description'
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
function FeatureCard({ icon: Icon, titleKey, descriptionKey, comingSoon }: Feature) {
  const { t } = useTranslation('landing');
  
  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-lg transition-shadow duration-300 border border-border/40 relative">
        {comingSoon && (
          <div className="absolute top-4 right-4 bg-primary/20 text-primary text-xs font-semibold px-2 py-1 rounded-full">
            Coming Soon
          </div>
        )}
        <CardHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle>{t(titleKey)}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
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
    <section id="features" className="py-16 md:py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('features.sectionTitle')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('features.sectionSubtitle')}
          </p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
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
