'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Download, ExternalLink, Star, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Animation variants
const sectionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: index * 0.1,
    },
  }),
};

interface PopularServer {
  id: string;
  name: string;
  description: string;
  installation_count: number;
  rating: number;
  ratingCount: number;
  github_stars: number | null;
  githubUrl: string | null;
}

export function PopularServersSection() {
  const { t } = useTranslation('landing');
  const [servers, setServers] = useState<PopularServer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch popular servers from API
    fetch('/api/service/search?sort=popularity&pageSize=6&source=registry')
      .then(res => res.json())
      .then(data => {
        if (data.results) {
          const serverList: PopularServer[] = Object.entries(data.results).map(([id, server]: [string, any]) => ({
            id,
            name: server.name || 'Unknown',
            description: server.description || '',
            installation_count: server.installation_count || 0,
            rating: server.rating || 0,
            ratingCount: server.ratingCount || 0,
            github_stars: server.github_stars,
            githubUrl: server.githubUrl,
          }));
          setServers(serverList);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching popular servers:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <section className="py-12 sm:py-16 md:py-20 lg:py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="h-8 w-64 bg-muted animate-pulse rounded mx-auto mb-4" />
            <div className="h-4 w-96 bg-muted animate-pulse rounded mx-auto" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <motion.section
      id="popular-servers"
      className="py-12 sm:py-16 md:py-20 lg:py-24 relative overflow-hidden bg-gradient-to-b from-background to-tech-blue-900/5"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#06b6d408_1px,transparent_1px),linear-gradient(to_bottom,#06b6d408_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-electric-cyan/10 border border-electric-cyan/20 mb-6"
          >
            <TrendingUp className="h-5 w-5 text-electric-cyan" />
            <span className="text-sm font-semibold text-electric-cyan">
              {t('popularServers.badge', 'Most Popular')}
            </span>
          </motion.div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple">
              {t('popularServers.title', 'Top MCP Servers')}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('popularServers.subtitle', 'Discover the most installed and highly-rated MCP servers from our community')}
          </p>
        </div>

        {/* Server Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {servers.map((server, index) => (
            <motion.div
              key={server.id}
              custom={index}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.1 }}
            >
              <Card className="h-full bg-background/50 backdrop-blur-sm border-border/50 hover:border-electric-cyan/50 transition-all duration-300 group">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg mb-2 truncate group-hover:text-electric-cyan transition-colors">
                        {server.name}
                      </CardTitle>
                      <CardDescription className="line-clamp-2">
                        {server.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Stats */}
                  <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Download className="h-4 w-4" />
                      <span>{server.installation_count.toLocaleString()}</span>
                    </div>
                    {server.ratingCount > 0 && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span>{server.rating.toFixed(1)}</span>
                        <span className="text-xs">({server.ratingCount})</span>
                      </div>
                    )}
                    {server.github_stars !== null && server.github_stars > 0 && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4" />
                        <span>{server.github_stars.toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      asChild
                      size="sm"
                      className="flex-1 bg-electric-cyan hover:bg-electric-cyan/90"
                    >
                      <Link href={`/search?query=${encodeURIComponent(server.name)}`}>
                        {t('popularServers.viewDetails', 'View Details')}
                      </Link>
                    </Button>
                    {server.githubUrl && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="border-electric-cyan/20 hover:bg-electric-cyan/10"
                      >
                        <a href={server.githubUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* CTA to Search */}
        <div className="text-center">
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-electric-cyan/20 hover:bg-electric-cyan/10"
          >
            <Link href="/search">
              {t('popularServers.exploreAll', 'Explore All 782+ Servers')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </motion.section>
  );
}
