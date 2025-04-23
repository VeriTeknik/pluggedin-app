'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Star } from 'lucide-react'; // Example icons
import Image from 'next/image';
import { useTranslation } from 'react-i18next';


// Animation variants
const sectionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const textVariants = {
  hidden: { x: -20, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.5, delay: 0.2 } },
};

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.4 } },
};

const listItemVariants = {
  hidden: { x: -10, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.3 } },
};

const imageVariants = {
  hidden: { x: 20, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.5, delay: 0.2 } },
};

export function LandingCommunitySharing() {
  const { t } = useTranslation('landing');

  // Placeholder benefits - update keys and content
  const benefits = [
    { key: 'features.customDevelopment.benefit1' },
    { key: 'features.customDevelopment.benefit2' },
    { key: 'features.customDevelopment.benefit3' },
    { key: 'features.customDevelopment.benefit4' },
  ];

  return (
    <motion.section
      id="community"
      className="py-16 md:py-24 lg:py-32 overflow-hidden"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
          {/* Text Content */}
          <motion.div variants={textVariants}>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
              {t('features.communitySharing.title')}
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              {t('features.communitySharing.description')}
            </p>
            <motion.ul className="space-y-3" variants={listVariants}>
              {benefits.map((benefit) => (
                <motion.li key={benefit.key} className="flex items-start" variants={listItemVariants}>
                  <CheckCircle className="h-5 w-5 text-primary mr-3 mt-1 flex-shrink-0" />
                  <span className="text-muted-foreground">{t(benefit.key)}</span>
                </motion.li>
              ))}
            </motion.ul>
            {/* Optional: Add a CTA button here */}
          </motion.div>

          {/* Visual Content */}
          <motion.div variants={imageVariants} className="relative aspect-video rounded-lg overflow-hidden shadow-xl border border-border/40 bg-muted">
             {/* Placeholder for visual representation */}
             {/* Replace with an actual Image component or interactive demo */}
             <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-muted-foreground italic">
                  {t('community.visualPlaceholder')}
                </p>
                {/* Example: Mockup of ratings */}
                <div className="absolute bottom-4 left-4 bg-background/80 p-2 rounded shadow flex items-center text-xs">
                    <Star className="h-3 w-3 text-yellow-400 mr-1"/> 4.8 (12 Reviews)
                </div>
             </div>
             {/* <Image src={placeholderImageUrl} alt="Community Sharing Visual" layout="fill" objectFit="cover" /> */}
             <Image src="/screenshot.png" alt="Community Sharing Visual" layout="fill" objectFit="cover" />
             {/* TODO: Consider Animated-beam here later */}
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
