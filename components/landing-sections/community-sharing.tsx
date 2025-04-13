'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Star } from 'lucide-react'; // Example icons
// Removed unused Image import
import { useTranslation } from 'react-i18next';

// TODO: Replace placeholder image with actual visual
const placeholderImageUrl = '/placeholder-community.png'; // Update this path

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
  const { t } = useTranslation(); // Use default hook

  // Placeholder benefits - update keys and content
  const benefits = [
    { key: 'landing.community.benefit1', default: 'Discover innovative servers from fellow developers.' },
    { key: 'landing.community.benefit2', default: 'Get feedback and ratings on your shared servers.' },
    { key: 'landing.community.benefit3', default: 'Collaborate and build upon community creations.' },
    { key: 'landing.community.benefit4', default: 'Stay updated with the latest MCP trends.' },
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
              {t('community.title', 'Join the MCP Community')} {/* Use relative key */}
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              {t('community.description', 'Share your MCP servers, discover powerful tools built by others, and collaborate within a growing ecosystem. Rate servers, leave reviews, and find the best solutions for your needs.')} {/* Use relative key */}
            </p>
            <motion.ul className="space-y-3" variants={listVariants}>
              {benefits.map((benefit) => (
                <motion.li key={benefit.key} className="flex items-start" variants={listItemVariants}>
                  <CheckCircle className="h-5 w-5 text-primary mr-3 mt-1 flex-shrink-0" />
                  <span className="text-muted-foreground">{t(benefit.key.replace('landing.', ''), benefit.default)}</span> {/* Use relative key */}
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
                  {t('community.visualPlaceholder', 'Visual showing server sharing/ratings')} {/* Use relative key */}
                </p>
                {/* Example: Mockup of ratings */}
                <div className="absolute bottom-4 left-4 bg-background/80 p-2 rounded shadow flex items-center text-xs">
                    <Star className="h-3 w-3 text-yellow-400 mr-1"/> 4.8 (12 Reviews)
                </div>
             </div>
             {/* <Image src={placeholderImageUrl} alt="Community Sharing Visual" layout="fill" objectFit="cover" /> */}
             {/* TODO: Consider Animated-beam here later */}
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
