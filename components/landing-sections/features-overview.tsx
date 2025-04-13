'use client';

import { motion } from 'framer-motion';
import { Blocks, Box, Search, Share2, TerminalSquare } from 'lucide-react'; // Example icons
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Define feature data structure
interface Feature {
  icon: React.ElementType;
  titleKey: string;
  descriptionKey: string;
  defaultTitle: string;
  defaultDescription: string;
}

// Placeholder feature data - update with actual keys and content
const features: Feature[] = [
  {
    icon: Share2,
    titleKey: 'landing.features.communitySharing.title',
    descriptionKey: 'landing.features.communitySharing.description',
    defaultTitle: 'Community MCP Server Sharing',
    defaultDescription: 'Share your MCP servers and discover creations from the community.',
  },
  {
    icon: Blocks,
    titleKey: 'landing.features.collectionManagement.title',
    descriptionKey: 'landing.features.collectionManagement.description',
    defaultTitle: 'Collection Management',
    defaultDescription: 'Organize servers into collections for different clients or projects.',
  },
  {
    icon: Box,
    titleKey: 'landing.features.workspaceOrganization.title',
    descriptionKey: 'landing.features.workspaceOrganization.description',
    defaultTitle: 'Workspace Organization',
    defaultDescription: 'Group collections into workspaces like development or production.',
  },
  {
    icon: Search,
    titleKey: 'landing.features.advancedSearch.title',
    descriptionKey: 'landing.features.advancedSearch.description',
    defaultTitle: 'Advanced Search',
    defaultDescription: 'Find the perfect MCP server with powerful filtering capabilities.',
  },
  {
    icon: TerminalSquare,
    titleKey: 'landing.features.mcpPlayground.title',
    descriptionKey: 'landing.features.mcpPlayground.description',
    defaultTitle: 'MCP Playground',
    defaultDescription: 'Test and debug your MCP servers in an interactive environment.',
  },
  // Add more features if needed
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
function FeatureCard({ icon: Icon, titleKey, descriptionKey, defaultTitle, defaultDescription }: Feature) {
  const { t } = useTranslation(); // Use default hook
  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-lg transition-shadow duration-300 border border-border/40">
        <CardHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle>{t(titleKey.replace('landing.', ''), defaultTitle)}</CardTitle> {/* Use relative key */}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t(descriptionKey.replace('landing.', ''), defaultDescription)} {/* Use relative key */}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Main Features Overview Section Component
export function LandingFeaturesOverview() {
  const { t } = useTranslation(); // Use default hook

  return (
    <section id="features" className="py-16 md:py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('features.sectionTitle', 'Powerful Features for MCP Management')} {/* Use relative key */}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('features.sectionSubtitle', 'Everything you need to connect, share, and discover MCP servers effectively.')} {/* Use relative key */}
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
