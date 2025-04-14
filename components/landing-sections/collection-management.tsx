'use client';

import { motion } from 'framer-motion';
import { FolderKanban, Layers } from 'lucide-react'; // Example icons
import Image from 'next/image';
import { useTranslation } from 'react-i18next';


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
  const { t } = useTranslation(); // Use default hook

  // Placeholder command examples
  const exampleCommands = `
# Create a new collection for your project
pluggedin collection create my-project-servers

# Add a server to the collection
pluggedin server add --collection my-project-servers --name "My API Server" --url http://...

# Organize collections into workspaces
pluggedin workspace add-collection --workspace development --collection my-project-servers
  `.trim();

  return (
    <motion.section
      id="collections"
      className="py-16 md:py-24 lg:py-32 bg-muted/30"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="container mx-auto px-4">
        <motion.div className="mb-12 text-center max-w-2xl mx-auto" variants={textVariants}>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('collections.title', 'Organize Your MCP Ecosystem')} {/* Use relative key */}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('collections.subtitle', 'Effortlessly manage servers with collections and workspaces, tailored for your workflow.')} {/* Use relative key */}
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

          {/* Explanatory Text */}
          <motion.div variants={textVariants}>
             <div className="flex items-start mb-6">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <FolderKanban className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('collections.collectionsTitle', 'Streamlined Collections')} {/* Use relative key */}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('collections.collectionsDesc', 'Group related MCP servers into logical collections for specific clients, applications, or environments.')} {/* Use relative key */}
                    </p>
                </div>
             </div>
             <div className="flex items-start">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <Layers className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('collections.workspacesTitle', 'Powerful Workspaces')} {/* Use relative key */}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('collections.workspacesDesc', 'Organize your collections further into workspaces, such as separating development, staging, and production setups.')} {/* Use relative key */}
                    </p>
                </div>
             </div>
             
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
