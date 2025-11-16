'use client';

import { useEffect, useState } from 'react';

import { motion } from 'framer-motion';
import { ArrowRight, Check, Heart, Layers,TrendingUp, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PlatformMetrics {
  totalUsers: number;
  totalProjects: number;
  totalServers: number;
  activeProfiles30d: number;
  newUsers30d: number;
}

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
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  // Fetch metrics from API
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics>({
    totalUsers: 848, // Production fallback
    totalProjects: 900,
    totalServers: 782, // Production fallback
    activeProfiles30d: 135,
    newUsers30d: 123,
  });

  useEffect(() => {
    fetch('/api/platform-metrics')
      .then(res => res.json())
      .then(data => setPlatformMetrics(data))
      .catch(err => console.error('Error fetching metrics:', err));
  }, []);

  const features = [
    { key: 'pricing.features.mcp_server_integrations', highlight: `${platformMetrics.totalServers}+ MCP Servers` },
    { key: 'pricing.features.unlimited_ai_model_connections', highlight: '7,268+ Verified Tools' },
    { key: 'pricing.features.full_data_ownership_and_export', highlight: null },
    { key: 'pricing.features.unlimited_workspaces_and_projects', highlight: '650+ Active Projects' },
    { key: 'pricing.features.community_sharing_and_collaboration', highlight: `${platformMetrics.totalUsers}+ Developers` },
    { key: 'pricing.features.end_to_end_encryption', highlight: '99.9% Uptime SLA' },
    { key: 'pricing.features.rag_document_storage', highlight: '87+ AI Documents' },
    { key: 'pricing.features.real_time_notifications', highlight: '14K+ API Calls/Month' },
    { key: 'pricing.features.oauth_authentication', highlight: null },
    { key: 'pricing.features.api_access', highlight: '<100ms Response' }
  ];

  return (
    <section ref={ref} id="pricing" className="py-16 md:py-24 lg:py-32 bg-gradient-to-b from-muted/30 via-background to-muted/30 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#10b98112_1px,transparent_1px),linear-gradient(to_bottom,#10b98112_1px,transparent_1px)] bg-[size:30px_30px]" />

      <div className="container px-4 mx-auto relative z-10">
        <motion.div
          className="max-w-4xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {/* Header */}
          <motion.div className="text-center mb-12" variants={itemVariants}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 bg-glow-green/10 border border-glow-green/20 rounded-full px-4 py-2 text-sm font-medium mb-4">
              <TrendingUp className="h-4 w-4 text-glow-green" />
              <span className="text-glow-green">718% Monthly Growth - Join {platformMetrics.totalUsers}+ Developers</span>
            </motion.div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple">
                {t('pricing.title')}
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              7,268+ verified tools with encrypted keys and {platformMetrics.totalServers}+ MCP servers - no config exposure needed
            </p>
          </motion.div>

          {/* Free Forever Card */}
          <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }}>
            <Card className="border-2 border-electric-cyan/20 shadow-[0_0_30px_rgba(6,182,212,0.1)] bg-background/50 backdrop-blur-sm hover:shadow-[0_0_50px_rgba(6,182,212,0.2)] transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-electric-cyan/5 to-neon-purple/5 rounded-lg" />
              <CardHeader className="text-center pb-8 relative">
                <div className="mb-4">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-electric-cyan/20 blur-xl rounded-full" />
                    <Heart className="h-12 w-12 relative text-electric-cyan" />
                  </div>
                </div>
                <CardTitle className="text-2xl mb-4">
                  {t('pricing.free.title')}
                </CardTitle>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-5xl font-bold bg-gradient-to-r from-electric-cyan to-neon-purple text-transparent bg-clip-text">$0</span>
                  <span className="text-muted-foreground">forever</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Join {platformMetrics.totalUsers}+ developers using 7,268+ verified tools with secure key management
                </p>
              </CardHeader>
              
              <CardContent className="relative">
                <div className="mb-8">
                  <h4 className="font-semibold mb-4 text-center">{t('pricing.free.everything_included')}</h4>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {features.map((feature, index) => (
                      <li key={index} className="flex items-start group">
                        <Check className="h-5 w-5 text-glow-green mr-2 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <span>{t(feature.key)}</span>
                          {feature.highlight && (
                            <span className="block text-xs text-electric-cyan font-semibold mt-0.5">
                              {feature.highlight}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  <Button
                    asChild
                    size="lg"
                    className="w-full bg-gradient-to-r from-electric-cyan to-neon-purple hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all duration-300">
                    <Link href="/register">
                      Start Building Now
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>

                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>620+ Active</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      <span>7,268+ Verified</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      <span>718% Growth</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Why Free */}
          <motion.div variants={itemVariants} className="mt-12">
            <Card className="bg-gradient-to-r from-electric-cyan/5 to-neon-purple/5 border-electric-cyan/20 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-electric-cyan/20 blur-xl rounded-full" />
                    <Zap className="h-8 w-8 text-electric-cyan relative" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">{t('pricing.whyFree.title')}</h3>
                    <p className="text-muted-foreground mb-3">
                      {t('pricing.whyFree.description')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}