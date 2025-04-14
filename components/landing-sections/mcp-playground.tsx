'use client';

import { motion } from 'framer-motion';
import { Beaker, Bug, Terminal } from 'lucide-react'; // Example icons
import Image from 'next/image';
import { useTranslation } from 'react-i18next';

// TODO: Integrate MagicUI components when available:
// - Terminal component
// - Script-copy-btn for code snippets

// Animation variants (can reuse or define new ones)
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

export function LandingMcpPlayground() {
  // Explicitly use the 'landing' namespace
  const { t } = useTranslation('landing');

  // Placeholder command examples for debugging
  const exampleCommands = `
# Connect to your local MCP server
pluggedin playground connect http://localhost:8080

# List available tools
mcp list-tools

# Call a specific tool with arguments
mcp call-tool --name get_weather --args '{"city": "London"}'

# Inspect resource contents
mcp read-resource weather://london/current
  `.trim();

  return (
    <motion.section
      id="playground"
      className="py-16 md:py-24 lg:py-32 bg-muted/30"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="container mx-auto px-4">
        <motion.div className="mb-12 text-center max-w-2xl mx-auto" variants={textVariants}>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('playground.title', 'Test & Debug with MCP Playground')} {/* Use key relative to 'landing' namespace */}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('playground.subtitle', 'An interactive environment to build, test, and refine your MCP servers.')} {/* Use key relative to 'landing' namespace */}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16 items-center">
          {/* Explanatory Text */}
          <motion.div variants={textVariants}>
             <div className="flex items-start mb-6">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <Terminal className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('playground.feature1Title', 'Interactive Testing')} {/* Use key relative to 'landing' namespace */}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('playground.feature1Desc', 'Directly interact with your MCP servers, call tools, and inspect resources in real-time.')} {/* Use key relative to 'landing' namespace */}
                    </p>
                </div>
             </div>
             <div className="flex items-start">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <Bug className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('playground.feature2Title', 'Efficient Debugging')} {/* Use key relative to 'landing' namespace */}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('playground.feature2Desc', 'Identify and resolve issues quickly with detailed request/response logs and error messages.')} {/* Use key relative to 'landing' namespace */}
                    </p>
                </div>
             </div>
              <div className="flex items-start mt-6">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                    <Beaker className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold">
                        {t('playground.feature3Title', 'Rapid Prototyping')} {/* Use key relative to 'landing' namespace */}
                    </h3>
                    <p className="text-muted-foreground mt-1">
                        {t('playground.feature3Desc', 'Experiment with different server configurations and tool implementations before deployment.')} {/* Use key relative to 'landing' namespace */}
                    </p>
                </div>
             </div>
             
          </motion.div>

           {/* Image Placeholder */}
           <motion.div variants={terminalVariants} className="flex items-center justify-center order-first lg:order-last">
             <div className="aspect-video w-full max-w-lg rounded-lg border border-border/40 relative overflow-hidden shadow-xl">
               <Image 
                 src="/screenshot3.png" 
                 alt="MCP Playground Interface"
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
