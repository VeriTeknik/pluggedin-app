'use client';

import { motion } from 'framer-motion';
import {
  Brain,
  Filter,
  Github,
  Globe,
  Package,
  Search,
  Star,
  Users,
  Zap} from 'lucide-react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { AnimatedMetric } from '@/components/ui/animated-metric';
import { Card, CardContent } from '@/components/ui/card';

// TODO: Integrate MagicUI components when available:
// - Safari component

// Animation variants
const sectionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const textVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.5, delay: 0.2 } },
};

const safariVariants = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.5, delay: 0.4 } },
};

export function LandingSearchFunctionality() {
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const stats = [
    { value: 7268, suffix: '+', label: 'Verified Tools' },
    { value: 1500, suffix: '+', label: 'MCP Servers' },
    { value: 460, suffix: '+', label: 'Active Servers' },
    { value: 620, suffix: '+', label: 'Contributors' },
  ];

  return (
    <motion.section
      ref={ref}
      id="search"
      className="py-12 sm:py-16 md:py-20 lg:py-24 xl:py-32 bg-gradient-to-b from-background via-muted/20 to-background relative overflow-hidden"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#06b6d408_1px,transparent_1px),linear-gradient(to_bottom,#06b6d408_1px,transparent_1px)] bg-[size:50px_50px]" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
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
              <AnimatedMetric
                value={stat.value}
                suffix={stat.suffix}
                label={stat.label}
                decimals={0}
              />
            </motion.div>
          ))}
        </motion.div>

        <motion.div className="mb-12 text-center max-w-3xl mx-auto" variants={textVariants}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-electric-cyan/10 border border-electric-cyan/20 mb-4">
            <Search className="h-4 w-4 text-electric-cyan" />
            <span className="text-sm font-semibold text-electric-cyan">7,268+ Verified Tools Ready to Use</span>
          </motion.div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple">
              {t('search.title')}
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Search 7,268+ verified tools with secure keys and 1,500+ MCP servers
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            Join 620+ developers discovering new AI capabilities daily
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16 items-center">
           {/* Features */}
           <motion.div variants={textVariants}>
             {/* Search Sources */}
             <div className="mb-8">
               <h3 className="text-xl font-semibold mb-4">
                 {t('search.sources.title')}
               </h3>
               <div className="grid grid-cols-2 gap-3">
                 <Card>
                   <CardContent className="p-3 flex items-center">
                     <Github className="h-5 w-5 text-primary mr-2" />
                     <span className="text-sm">{t('search.sources.github')}</span>
                   </CardContent>
                 </Card>
                 <Card>
                   <CardContent className="p-3 flex items-center">
                     <Globe className="h-5 w-5 text-primary mr-2" />
                     <span className="text-sm">{t('search.sources.smithery')}</span>
                   </CardContent>
                 </Card>
                 <Card>
                   <CardContent className="p-3 flex items-center">
                     <Package className="h-5 w-5 text-primary mr-2" />
                     <span className="text-sm">{t('search.sources.npm')}</span>
                   </CardContent>
                 </Card>
                 <Card>
                   <CardContent className="p-3 flex items-center">
                     <Users className="h-5 w-5 text-primary mr-2" />
                     <span className="text-sm">{t('search.sources.community')}</span>
                   </CardContent>
                 </Card>
               </div>
             </div>
             
             {/* Search Features */}
             <div className="space-y-4">
               <div className="flex items-start">
                  <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                      <Brain className="h-5 w-5" />
                  </div>
                  <div>
                      <h3 className="text-lg font-semibold">
                          {t('search.feature1Title')}
                      </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('search.feature1Desc')}
                    </p>
                </div>
             </div>
             
             <div className="flex items-start">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <Star className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('search.feature2Title')}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('search.feature2Desc')}
                    </p>
                </div>
             </div>
             
             <div className="flex items-start">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <Filter className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('search.feature3Title')}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('search.feature3Desc')}
                    </p>
                </div>
             </div>
             
             <div className="flex items-start">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <Zap className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('search.feature4Title')}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('search.feature4Desc')}
                    </p>
                </div>
             </div>
           </div>
         </motion.div>

          {/* Image Placeholder (representing CardGrid) */}
          <motion.div variants={safariVariants} className="flex items-center justify-center">
            <div className="aspect-video w-full max-w-lg rounded-lg border border-border/40 relative overflow-hidden shadow-xl">
              <Image 
                src="/screenshot2.png" 
                alt="Search Functionality Visual"
                fill
                className="object-cover"
                priority
              />
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
