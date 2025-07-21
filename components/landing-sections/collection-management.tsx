'use client';

import { motion } from 'framer-motion';
import { 
  BarChart3, 
  GitBranch, 
  Layers, 
  Share2} from 'lucide-react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';


// TODO: Integrate MagicUI components when available:
// - Terminal component
// - Script-copy-btn for code snippets

// Animation variants
const sectionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const textVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.5, delay: 0.2 } },
};

const terminalVariants = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.5, delay: 0.4 } },
};

export function LandingCollectionManagement() {
  const { t } = useTranslation('landing');


  return (
    <motion.section
      id="collections"
      className="py-12 sm:py-16 md:py-20 lg:py-24 xl:py-32 bg-muted/30"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div className="mb-8 sm:mb-10 lg:mb-12 text-center max-w-3xl mx-auto" variants={textVariants}>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl leading-tight">
            {t('collections.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('collections.subtitle')}
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            {t('collections.description')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16 items-center">
          {/* Image Placeholder */}
          <motion.div variants={terminalVariants} className="flex items-center justify-center">
            <div className="aspect-video w-full max-w-lg rounded-lg border border-border/40 relative overflow-hidden shadow-xl">
              <Image 
                src="/screenshot1.png" 
                alt="Collection Management Visual" 
                fill
                className="object-cover"
                priority
              />
            </div>
          </motion.div>

          {/* Features */}
          <motion.div variants={textVariants}>
             {/* Version Control */}
             <div className="mb-8">
               <h3 className="text-xl font-semibold mb-4">
                 {t('collections.versionControl.title')}
               </h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {[1, 2, 3, 4].map((i) => (
                   <div key={i} className="flex items-start">
                     <GitBranch className="h-5 w-5 text-primary mr-2 mt-0.5 flex-shrink-0" />
                     <span className="text-sm text-muted-foreground">
                       {t(`collections.versionControl.feature${i}`)}
                     </span>
                   </div>
                 ))}
               </div>
             </div>

             {/* Sharing Features */}
             <div className="mb-8">
               <h3 className="text-xl font-semibold mb-4">
                 {t('collections.sharing.title')}
               </h3>
               <div className="grid grid-cols-1 gap-3">
                 <Card>
                   <CardContent className="p-4 flex items-start">
                     <Share2 className="h-5 w-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
                     <div>
                       <p className="font-medium">{t('collections.sharing.public')}</p>
                       <p className="text-sm text-muted-foreground">{t('collections.sharing.private')}</p>
                     </div>
                   </CardContent>
                 </Card>
                 <Card>
                   <CardContent className="p-4 flex items-start">
                     <BarChart3 className="h-5 w-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
                     <div>
                       <p className="font-medium">{t('collections.sharing.stats')}</p>
                       <p className="text-sm text-muted-foreground">{t('collections.sharing.ratings')}</p>
                     </div>
                   </CardContent>
                 </Card>
               </div>
             </div>

             {/* Workspaces */}
             <div className="flex items-start">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <Layers className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('collections.workspacesTitle')}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('collections.workspacesDesc')}
                    </p>
                </div>
             </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
