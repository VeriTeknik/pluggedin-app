'use client';

import { motion } from 'framer-motion';
import { Bell, BookOpen, Download, Globe, Lock, Package, Search, Sparkles, TrendingUp, User, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const articles = [
  {
    slug: 'send-notifications-from-ai',
    icon: Bell,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    category: 'feature',
    isNew: true,
    readTime: '5 min',
    date: '2025-06-21',
  },
  {
    slug: 'document-context-rag',
    icon: BookOpen,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    category: 'feature',
    readTime: '8 min',
    date: '2025-06-19',
  },
  {
    slug: 'encryption-security',
    icon: Lock,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    category: 'security',
    readTime: '3 min',
    date: '2025-06-21',
  },
  {
    slug: 'lightning-fast-startup',
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    category: 'performance',
    readTime: '4 min',
    date: '2025-06-19',
  },
  {
    slug: 'public-profile',
    icon: User,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    category: 'social',
    readTime: '5 min',
    date: '2025-04-14',
  },
  {
    slug: 'import-export-setup',
    icon: Download,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    category: 'feature',
    readTime: '6 min',
    date: '2025-04-14',
  },
  {
    slug: 'multilingual-support',
    icon: Globe,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
    category: 'feature',
    readTime: '3 min',
    date: '2025-04-14',
  },
  {
    slug: 'discover-capabilities',
    icon: Search,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    category: 'feature',
    readTime: '7 min',
    date: '2025-04-02',
  },
  {
    slug: 'share-collections',
    icon: Package,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    category: 'feature',
    readTime: '6 min',
    date: '2025-04-14',
  },
  {
    slug: 'activity-tracking',
    icon: TrendingUp,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    category: 'feature',
    readTime: '4 min',
    date: '2025-06-19',
  },
  {
    slug: 'customize-experience',
    icon: Sparkles,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    category: 'feature',
    readTime: '7 min',
    date: '2025-04-14',
  },
];

export default function WhatsNewPageClient() {
  const { t } = useTranslation(['whatsNew', 'common']);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-12">
        <motion.h1 
          className="text-4xl md:text-5xl font-bold mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {t('whatsNew:title')}
        </motion.h1>
        <motion.p 
          className="text-lg text-muted-foreground max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {t('whatsNew:description')}
        </motion.p>
      </div>

      {/* Search */}
      <motion.div 
        className="max-w-xl mx-auto mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Input
          placeholder={t('whatsNew:searchPlaceholder')}
          className="w-full"
        />
      </motion.div>

      {/* Category Filters */}
      <motion.div 
        className="flex justify-center gap-2 mb-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">
          {t('whatsNew:categories.all')}
        </Badge>
        <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">
          {t('whatsNew:categories.features')}
        </Badge>
        <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">
          {t('whatsNew:categories.security')}
        </Badge>
        <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">
          {t('whatsNew:categories.performance')}
        </Badge>
        <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">
          {t('whatsNew:categories.social')}
        </Badge>
      </motion.div>

      {/* Articles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {articles.map((article, index) => {
          const Icon = article.icon;
          return (
            <motion.div
              key={article.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.1 }}
            >
              <Link href={`/docs/whats-new/${article.slug}`}>
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-lg ${article.bgColor}`}>
                        <Icon className={`w-6 h-6 ${article.color}`} />
                      </div>
                      {article.isNew && (
                        <Badge variant="destructive" className="ml-2">
                          {t('whatsNew:new')}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl">
                      {t(`whatsNew:articles.${article.slug}.title`)}
                    </CardTitle>
                    <CardDescription>
                      {t(`whatsNew:articles.${article.slug}.description`)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{article.readTime} {t('whatsNew:readTime')}</span>
                      <span>{new Date(article.date).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Newsletter Signup */}
      <motion.div 
        className="mt-16 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{t('whatsNew:newsletter.title')}</CardTitle>
            <CardDescription>
              {t('whatsNew:newsletter.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder={t('whatsNew:newsletter.placeholder')}
                className="flex-1"
              />
              <button className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                {t('whatsNew:newsletter.subscribe')}
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}