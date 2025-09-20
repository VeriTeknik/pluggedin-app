'use client';

import { motion } from 'framer-motion';
import { ExternalLink, Github, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useGithubStars } from '@/hooks/useGithubStars';
import { cn } from '@/lib/utils';

interface Repository {
  name: string;
  repo: string;
  description: string;
  url: string;
}

const repositories: Repository[] = [
  {
    name: 'Plugged.in App',
    repo: 'VeriTeknik/pluggedin-app',
    description: 'The main application - Next.js web platform for MCP management',
    url: 'https://github.com/VeriTeknik/pluggedin-app',
  },
  {
    name: 'MCP Proxy',
    repo: 'VeriTeknik/pluggedin-mcp-proxy',
    description: 'Universal proxy server for Model Context Protocol',
    url: 'https://github.com/VeriTeknik/pluggedin-mcp-proxy',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
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

export function LandingOpenSourceSection() {
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  // Fetch stars for both repositories
  const appStars = useGithubStars('VeriTeknik/pluggedin-app');
  const proxyStars = useGithubStars('VeriTeknik/pluggedin-mcp-proxy');

  const starsMap = {
    'VeriTeknik/pluggedin-app': appStars,
    'VeriTeknik/pluggedin-mcp-proxy': proxyStars,
  };

  return (
    <section ref={ref} className="py-12 sm:py-16 md:py-20 lg:py-24 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/30 to-background" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080801a_1px,transparent_1px),linear-gradient(to_bottom,#8080801a_1px,transparent_1px)] bg-[size:20px_20px]" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-purple/10 border border-neon-purple/20 mb-4">
            <Github className="h-4 w-4 text-neon-purple" />
            <span className="text-sm font-semibold text-neon-purple">{t('opensource.badge')}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-electric-cyan">
              {t('opensource.title')}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground">
            {t('opensource.subtitle')}
          </p>
        </motion.div>

        {/* Repository Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {repositories.map((repository) => {
            const stars = starsMap[repository.repo as keyof typeof starsMap];

            return (
              <motion.div
                key={repository.repo}
                variants={itemVariants}
                whileHover={{ scale: 1.02, y: -5 }}
                className="group"
              >
                <Card className={cn(
                  "h-full transition-all duration-300",
                  "border border-border/40 hover:border-neon-purple/50",
                  "bg-background/50 backdrop-blur-sm",
                  "hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]"
                )}>
                  <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                  <CardContent className="relative p-6">
                    {/* Repository Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-neon-purple/10 to-electric-cyan/10 text-neon-purple group-hover:from-neon-purple/20 group-hover:to-electric-cyan/20 transition-colors">
                          <Github className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{repository.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {repository.repo.split('/')[1]}
                          </p>
                        </div>
                      </div>
                      {/* Stars Badge */}
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        <span className="text-sm font-semibold text-yellow-500">
                          {stars !== null ? stars.toLocaleString() : '...'}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground mb-6 line-clamp-2">
                      {t(`opensource.repos.${repository.name === 'Plugged.in App' ? 'app' : 'proxy'}.description`)}
                    </p>

                    {/* Action Button */}
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="w-full border-neon-purple/20 hover:bg-neon-purple/10 hover:border-neon-purple/50 transition-all"
                    >
                      <a
                        href={repository.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2"
                      >
                        <Github className="h-4 w-4" />
                        {t('opensource.viewOnGithub')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6 }}
          className="mt-12 text-center"
        >
          <p className="text-sm text-muted-foreground mb-4">
            {t('opensource.contribute')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-neon-purple/20 hover:bg-neon-purple/10"
            >
              <a
                href="https://github.com/VeriTeknik"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Github className="h-4 w-4" />
                {t('opensource.followOrg')}
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}