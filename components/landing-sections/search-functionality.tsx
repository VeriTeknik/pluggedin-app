'use client';

import { motion } from 'framer-motion';
import { Filter, ListChecks, SearchCode } from 'lucide-react'; // Example icons
import { useTranslation } from 'react-i18next'; // Correct import

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
            {t('search.title', 'Find the Right Tools, Instantly')} {/* Use key relative to 'landing' namespace */}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('search.subtitle', 'Discover MCP servers and tools with powerful search and filtering options.')} {/* Use key relative to 'landing' namespace */}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16 items-center">
           {/* Explanatory Text */}
           <motion.div variants={textVariants}>
             <div className="flex items-start mb-6">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <SearchCode className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('search.feature1Title', 'Intelligent Search')} {/* Use key relative to 'landing' namespace */}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('search.feature1Desc', 'Quickly find servers by name, description, or capabilities using our smart search algorithm.')} {/* Use key relative to 'landing' namespace */}
                    </p>
                </div>
             </div>
             <div className="flex items-start">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <Filter className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('search.feature2Title', 'Advanced Filtering')} {/* Use key relative to 'landing' namespace */}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('search.feature2Desc', 'Narrow down results with filters for categories, tags, ratings, and compatibility.')} {/* Use key relative to 'landing' namespace */}
                    </p>
                </div>
             </div>
              <div className="flex items-start mt-6">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <ListChecks className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('search.feature3Title', 'Detailed Previews')} {/* Use key relative to 'landing' namespace */}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('search.feature3Desc', 'View server details, ratings, and community reviews directly from the search results.')} {/* Use key relative to 'landing' namespace */}
                    </p>
                </div>
             </div>
          </motion.div>

          {/* Image Placeholder (representing CardGrid) */}
          <motion.div variants={safariVariants} className="flex items-center justify-center">
            {/* TODO: Replace with actual Image component */}
            <div className="aspect-video w-full max-w-lg rounded-lg border border-border/40 bg-muted flex items-center justify-center shadow-xl">
              <p className="text-muted-foreground italic text-sm text-center p-4">
                {t('search.imagePlaceholder', 'Image: Search results showing community servers (CardGrid Mockup)')} {/* Use key relative to 'landing' namespace */}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
