'use client';

import { motion } from 'framer-motion';
import { 
  Brain,
  Filter, 
  Github,
  Globe, 
  Package,
  Star,
  Users,
  Zap
} from 'lucide-react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';

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
  // Explicitly use the 'landing' namespace
  const { t } = useTranslation('landing');

  return (
    <motion.section
      id="search" // Consider if this ID is needed or if it should be part of features/community etc.
      className="py-16 md:py-24 lg:py-32"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="container mx-auto px-4">
        <motion.div className="mb-12 text-center max-w-2xl mx-auto" variants={textVariants}>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('search.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('search.subtitle')}
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            {t('search.description')}
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
