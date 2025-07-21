'use client';

import { motion } from 'framer-motion';
import { 
  Bell,
  BookOpen, 
  Code2, 
  FileText, 
  Puzzle, 
  Rocket,
  Search
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const categories = [
  {
    id: 'whats-new',
    icon: Bell,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    href: '/docs/whats-new',
  },
  {
    id: 'getting-started',
    icon: Rocket,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    href: '/docs/getting-started',
  },
  {
    id: 'tutorials',
    icon: BookOpen,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    href: '/docs/tutorials',
  },
  {
    id: 'api-reference',
    icon: Code2,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    href: '/docs/api-reference',
  },
  {
    id: 'guides',
    icon: FileText,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    href: '/docs/guides',
  },
  {
    id: 'integrations',
    icon: Puzzle,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    href: '/docs/integrations',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
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

export default function DocsPageClient() {
  const { t } = useTranslation('docs');

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t('description')}
        </p>
      </div>

      {/* Search */}
      <div className="max-w-2xl mx-auto mb-12">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="search"
            placeholder={t('search.placeholder')}
            className="pl-10 h-12"
          />
        </div>
      </div>

      {/* Categories */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <motion.div key={category.id} variants={itemVariants}>
              <Link href={category.href}>
                <Card className="h-full hover:shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer">
                  <CardHeader>
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${category.bgColor} mb-4`}>
                      <Icon className={`h-6 w-6 ${category.color}`} />
                    </div>
                    <CardTitle>{t(`categories.${category.id}`)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {/* We'll add descriptions for each category in the translation files later */}
                      Learn more about {t(`categories.${category.id}`).toLowerCase()}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Popular Articles Section (placeholder for now) */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold mb-6">Popular Articles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* These will be populated dynamically later */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Quick Start Guide</CardTitle>
              <CardDescription>Get up and running with Plugged.in in 5 minutes</CardDescription>
            </CardHeader>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">MCP Server Setup</CardTitle>
              <CardDescription>Learn how to configure and manage MCP servers</CardDescription>
            </CardHeader>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">API Authentication</CardTitle>
              <CardDescription>Secure your API calls with proper authentication</CardDescription>
            </CardHeader>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Building Custom Tools</CardTitle>
              <CardDescription>Create custom MCP tools for your workflow</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-16 text-center bg-muted/30 rounded-lg p-8">
        <h3 className="text-xl font-semibold mb-4">Need Help?</h3>
        <p className="text-muted-foreground mb-6">
          Can&apos;t find what you&apos;re looking for? We&apos;re here to help.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild variant="outline">
            <Link href="/legal/contact">Contact Support</Link>
          </Button>
          <Button asChild variant="outline">
            <a href="https://www.reddit.com/r/plugged_in/" target="_blank" rel="noopener noreferrer">
              Join Reddit
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="https://x.com/PluggedIntoAI" target="_blank" rel="noopener noreferrer">
              Follow on X
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}