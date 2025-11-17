'use client';

import { useEffect, useState } from 'react';

import { motion } from 'framer-motion';
import { ArrowRight, Check, Layers, Rocket, Shield, TrendingUp, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { AnimatedMetric } from '@/components/ui/animated-metric';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FALLBACK_METRICS } from '@/lib/constants/metrics';

interface PlatformMetrics {
  totalUsers: number;
  totalProjects: number;
  totalServers: number;
  activeProfiles30d: number;
  newUsers30d: number;
}

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
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  // Fetch metrics from API with centralized fallback values
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics>({
    totalUsers: FALLBACK_METRICS.totalUsers,
    totalProjects: FALLBACK_METRICS.totalProjects,
    totalServers: FALLBACK_METRICS.totalServers,
    activeProfiles30d: FALLBACK_METRICS.newProfiles30d,
    newUsers30d: FALLBACK_METRICS.newUsers30d,
  });
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    setIsLoadingMetrics(true);
    setHasError(false);

    fetch('/api/platform-metrics', { signal: abortController.signal })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (!abortController.signal.aborted) {
          setPlatformMetrics(data);
          setIsLoadingMetrics(false);
        }
      })
      .catch(err => {
        // Ignore abort errors
        if (err.name === 'AbortError') return;

        if (!abortController.signal.aborted) {
          setHasError(true);
          setIsLoadingMetrics(false);
          // Only log in development
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to fetch platform metrics, using fallback values:', err);
          }
        }
      });

    // Cleanup: abort fetch if component unmounts
    return () => abortController.abort();
  }, []);

  const stats = [
    { icon: TrendingUp, value: 718, suffix: '%', label: 'Monthly Growth' },
    { icon: Layers, value: 7268, suffix: '+', label: 'Verified Tools' },
    { icon: Users, value: platformMetrics.totalUsers, suffix: '+', label: 'Active Developers' },
    { icon: Zap, value: 14000, suffix: '+', label: 'API Calls/Month' },
  ];

  return (
    <motion.section
      ref={ref}
      id="cta"
      className="py-12 sm:py-16 md:py-20 lg:py-24 xl:py-32 relative overflow-hidden bg-gradient-to-b from-background via-tech-blue-900/10 to-background"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
    >
      {/* Animated Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#06b6d412_1px,transparent_1px),linear-gradient(to_bottom,#06b6d412_1px,transparent_1px)] bg-[size:30px_30px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-electric-cyan/10 rounded-full blur-3xl animate-pulse" />
      </div>

      <motion.div
        className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-5xl"
        variants={contentVariants}
      >
        {/* Growth Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: index * 0.1 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-electric-cyan/10 to-neon-purple/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative bg-background/50 backdrop-blur-sm border border-border/50 rounded-lg p-4 hover:border-electric-cyan/50 transition-colors">
                <stat.icon className="w-6 h-6 mx-auto mb-2 text-electric-cyan" />
                <AnimatedMetric
                  value={stat.value}
                  suffix={stat.suffix}
                  label={stat.label}
                  decimals={0}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 0.2 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-glow-green/10 border border-glow-green/20 mb-6"
        >
          <Rocket className="h-5 w-5 text-glow-green" />
          <span className="text-sm font-semibold text-glow-green">
            Fastest Growing AI Platform
          </span>
        </motion.div>

        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple">
            Join {platformMetrics.totalUsers}+ Developers Building the Future
          </span>
        </h2>
        <p className="text-xl text-muted-foreground mb-4">
          7,000+ verified tools with encrypted keys and {platformMetrics.totalServers}+ MCP servers
        </p>
        <p className="text-base text-muted-foreground mb-8 max-w-2xl mx-auto">
          From startup to scale-up in 30 days. Be part of the 718% monthly growth story.
        </p>

        {/* Features Grid */}
        <Card className="mb-8 max-w-3xl mx-auto bg-background/50 backdrop-blur-sm border-electric-cyan/20">
          <CardContent className="p-8">
            <h3 className="text-lg font-semibold mb-6 text-electric-cyan">What You Get Today</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div className="flex items-start">
                <Check className="h-5 w-5 text-glow-green mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">7,268+ Verified Tools</span>
                  <p className="text-sm text-muted-foreground">Pre-verified with encrypted key storage - no config exposure</p>
                </div>
              </div>
              <div className="flex items-start">
                <Check className="h-5 w-5 text-glow-green mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">{platformMetrics.totalServers}+ MCP Servers</span>
                  <p className="text-sm text-muted-foreground">Pre-configured and ready to use</p>
                </div>
              </div>
              <div className="flex items-start">
                <Check className="h-5 w-5 text-glow-green mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">99.9% Uptime SLA</span>
                  <p className="text-sm text-muted-foreground">Enterprise-grade reliability</p>
                </div>
              </div>
              <div className="flex items-start">
                <Check className="h-5 w-5 text-glow-green mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">&lt;100ms Response Time</span>
                  <p className="text-sm text-muted-foreground">Lightning-fast performance</p>
                </div>
              </div>
              <div className="flex items-start">
                <Check className="h-5 w-5 text-glow-green mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">SOC 2 & ISO 27001</span>
                  <p className="text-sm text-muted-foreground">Enterprise security compliance</p>
                </div>
              </div>
              <div className="flex items-start">
                <Check className="h-5 w-5 text-glow-green mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">24/7 Support</span>
                  <p className="text-sm text-muted-foreground">Join {platformMetrics.totalUsers}+ active developers</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button
            asChild
            size="lg"
            className="bg-gradient-to-r from-electric-cyan to-neon-purple hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all duration-300"
          >
            <Link href="/register">
              Start Building Now
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-electric-cyan/20 hover:bg-electric-cyan/10"
          >
            <Link href="/discover">
              Explore Verified Tools
              <Layers className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Trust Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6 }}
          className="mt-12 p-6 bg-gradient-to-r from-electric-cyan/5 to-neon-purple/5 backdrop-blur-sm rounded-lg max-w-2xl mx-auto border border-electric-cyan/20"
        >
          <div className="flex items-center justify-center mb-3">
            <Shield className="h-6 w-6 text-glow-green mr-2" />
            <span className="font-semibold text-glow-green">Trusted by Leading Organizations</span>
          </div>
          <p className="text-sm text-muted-foreground">
            "The 718% growth speaks for itself. This platform transformed our AI development workflow completely."
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            - Engineering Lead at Fortune 500 Company
          </p>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
