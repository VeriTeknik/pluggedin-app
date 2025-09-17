'use client';

import { motion } from 'framer-motion';
import {
  Bell,
  Blocks,
  BookOpen,
  Box,
  Brain,
  Clock,
  Database,
  FileText,
  Key,
  Lock,
  Package,
  Search,
  Settings,
  Share2,
  Shield,
  TrendingUp,
  Wrench,
  Layers,
  Zap,
  Users,
  Rocket} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedMetric } from '@/components/ui/animated-metric';
import { cn } from '@/lib/utils';

// Define feature data structure
interface Feature {
  icon: React.ElementType;
  titleKey: string;
  descriptionKey: string;
  comingSoon?: boolean;
  pillar?: 'knowledge' | 'memory' | 'tools';
}

// Features organized by the three pillars
const knowledgeFeatures: Feature[] = [
  {
    icon: BookOpen,
    titleKey: 'features.documentLibrary.title',
    descriptionKey: 'features.documentLibrary.description',
    pillar: 'knowledge'
  },
  {
    icon: Database,
    titleKey: 'features.ragIntegration.title',
    descriptionKey: 'features.ragIntegration.description',
    pillar: 'knowledge'
  },
  {
    icon: FileText,
    titleKey: 'features.aiDocumentExchange.title',
    descriptionKey: 'features.aiDocumentExchange.description',
    pillar: 'knowledge'
  },
  {
    icon: Search,
    titleKey: 'features.semanticSearch.title',
    descriptionKey: 'features.semanticSearch.description',
    pillar: 'knowledge'
  }
];

const memoryFeatures: Feature[] = [
  {
    icon: Clock,
    titleKey: 'features.crossModelMemory.title',
    descriptionKey: 'features.crossModelMemory.description',
    comingSoon: true,
    pillar: 'memory'
  }
];

const toolsFeatures: Feature[] = [
  {
    icon: Package,
    titleKey: 'features.mcpRegistry.title',
    descriptionKey: 'features.mcpRegistry.description',
    pillar: 'tools'
  },
  {
    icon: Settings,
    titleKey: 'features.customInstructions.title',
    descriptionKey: 'features.customInstructions.description',
    pillar: 'tools'
  },
  {
    icon: Bell,
    titleKey: 'features.realtimeNotifications.title',
    descriptionKey: 'features.realtimeNotifications.description',
    pillar: 'tools'
  },
  {
    icon: Wrench,
    titleKey: 'features.mcpPlayground.title',
    descriptionKey: 'features.mcpPlayground.description',
    pillar: 'tools'
  }
];

// Additional platform features
const platformFeatures: Feature[] = [
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
    icon: Lock,
    titleKey: 'features.endToEndEncryption.title',
    descriptionKey: 'features.endToEndEncryption.description'
  },
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
    <motion.div variants={itemVariants} whileHover={{ scale: 1.02, y: -5 }}>
      <Card className={cn(
        "h-full transition-all duration-300 relative group",
        "border border-border/40 hover:border-electric-cyan/50",
        "bg-background/50 backdrop-blur-sm",
        "hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]"
      )}>
        {comingSoon && (
          <div className="absolute top-4 right-4 bg-neon-purple/20 text-neon-purple text-xs font-semibold px-2 py-1 rounded-full">
            Coming Soon
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-electric-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
        <CardHeader className="relative">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-electric-cyan/10 to-neon-purple/10 text-electric-cyan group-hover:from-electric-cyan/20 group-hover:to-neon-purple/20 transition-colors">
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle>{t(titleKey)}</CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <p className="text-sm text-muted-foreground">
            {t(descriptionKey)}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Pillar Section Component
function PillarSection({ title, subtitle, features, delay = 0 }: {
  title: string;
  subtitle: string;
  features: Feature[];
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      viewport={{ once: true }}
      className="mb-16"
    >
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold">{title}</h3>
        <p className="text-muted-foreground mt-2">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <FeatureCard key={feature.titleKey} {...feature} />
        ))}
      </div>
    </motion.div>
  );
}

// Main Features Overview Section Component
export function LandingFeaturesOverview() {
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const stats = [
    { icon: Layers, value: 7268, suffix: '+', label: 'Verified Tools' },
    { icon: Rocket, value: 1500, suffix: '+', label: 'MCP Servers' },
    { icon: Users, value: 620, suffix: '+', label: 'Active Developers' },
    { icon: Zap, value: 99.9, suffix: '%', label: 'Uptime SLA', decimals: 1 },
  ];

  return (
    <section ref={ref} id="features" className="py-16 md:py-24 lg:py-32 bg-gradient-to-b from-background via-muted/30 to-background relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: index * 0.1 }}
              className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-electric-cyan/10 text-electric-cyan mb-2">
                <stat.icon className="w-6 h-6" />
              </div>
              <AnimatedMetric
                value={stat.value}
                suffix={stat.suffix}
                label={stat.label}
                decimals={stat.decimals}
              />
            </motion.div>
          ))}
        </motion.div>

        <div className="mb-12 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-glow-green/10 border border-glow-green/20 mb-4">
            <TrendingUp className="h-4 w-4 text-glow-green" />
            <span className="text-sm font-semibold text-glow-green">718% Monthly Growth</span>
          </motion.div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple">
              {t('features.sectionTitle')}
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join 620+ developers leveraging our comprehensive AI infrastructure
          </p>
        </div>

        {/* Three Pillars */}
        <PillarSection
          title={t('features.pillars.knowledge.title')}
          subtitle={t('features.pillars.knowledge.subtitle')}
          features={knowledgeFeatures}
          delay={0}
        />

        <PillarSection
          title={t('features.pillars.memory.title')}
          subtitle={t('features.pillars.memory.subtitle')}
          features={memoryFeatures}
          delay={0.2}
        />

        <PillarSection
          title={t('features.pillars.tools.title')}
          subtitle={t('features.pillars.tools.subtitle')}
          features={toolsFeatures}
          delay={0.4}
        />

        {/* Platform Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          viewport={{ once: true }}
        >
          <h3 className="text-2xl font-bold text-center mb-8">Platform Features</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {platformFeatures.map((feature) => (
              <FeatureCard key={feature.titleKey} {...feature} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
