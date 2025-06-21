'use client';

import { motion } from 'framer-motion';
import {
  Bell,
  BookOpen,
  Brain,
  Clock,
  Code2,
  FileSearch,
  Globe,
  Lock,
  Package,
  Search,
  Server,
  Share2,
  Shield,
  Users,
  Zap
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

interface Tutorial {
  id: string;
  icon: React.ElementType;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: number; // in minutes
  tags: string[];
  href: string;
}

const tutorials: Tutorial[] = [
  {
    id: 'first-mcp-server',
    icon: Server,
    difficulty: 'beginner',
    duration: 15,
    tags: ['mcp', 'basics', 'setup'],
    href: '/docs/tutorials/first-mcp-server',
  },
  {
    id: 'sharing-with-community',
    icon: Share2,
    difficulty: 'beginner',
    duration: 20,
    tags: ['social', 'sharing', 'community'],
    href: '/docs/tutorials/sharing-with-community',
  },
  {
    id: 'rag-knowledge-base',
    icon: Brain,
    difficulty: 'intermediate',
    duration: 30,
    tags: ['rag', 'documents', 'ai'],
    href: '/docs/tutorials/rag-knowledge-base',
  },
  {
    id: 'using-rag-in-client',
    icon: FileSearch,
    difficulty: 'intermediate',
    duration: 25,
    tags: ['rag', 'mcp-client', 'query'],
    href: '/docs/tutorials/using-rag-in-client',
  },
  {
    id: 'notifications-system',
    icon: Bell,
    difficulty: 'intermediate',
    duration: 20,
    tags: ['notifications', 'mcp-client', 'automation'],
    href: '/docs/tutorials/notifications-system',
  },
  {
    id: 'team-collaboration',
    icon: Users,
    difficulty: 'intermediate',
    duration: 25,
    tags: ['teams', 'workspaces', 'sharing'],
    href: '/docs/tutorials/team-collaboration',
  },
  {
    id: 'custom-mcp-server',
    icon: Code2,
    difficulty: 'advanced',
    duration: 45,
    tags: ['development', 'mcp', 'programming'],
    href: '/docs/tutorials/custom-mcp-server',
  },
  {
    id: 'api-integration',
    icon: Zap,
    difficulty: 'advanced',
    duration: 35,
    tags: ['api', 'integration', 'automation'],
    href: '/docs/tutorials/api-integration',
  },
  {
    id: 'self-hosting',
    icon: Package,
    difficulty: 'advanced',
    duration: 60,
    tags: ['deployment', 'docker', 'self-host'],
    href: '/docs/tutorials/self-hosting',
  },
  {
    id: 'security-best-practices',
    icon: Shield,
    difficulty: 'advanced',
    duration: 40,
    tags: ['security', 'encryption', 'best-practices'],
    href: '/docs/tutorials/security-best-practices',
  },
];

const difficultyColors = {
  beginner: 'bg-green-500/10 text-green-600',
  intermediate: 'bg-yellow-500/10 text-yellow-600',
  advanced: 'bg-red-500/10 text-red-600',
};

const difficultyIcons = {
  beginner: '🌱',
  intermediate: '🚀',
  advanced: '💎',
};

function TutorialCard({ tutorial }: { tutorial: Tutorial }) {
  const { t } = useTranslation('tutorials');
  const Icon = tutorial.icon;

  return (
    <motion.div variants={itemVariants}>
      <Link href={tutorial.href}>
        <Card className="h-full hover:shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer group">
          <CardHeader>
            <div className="flex items-start justify-between mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Icon className="h-6 w-6" />
              </div>
              <Badge className={difficultyColors[tutorial.difficulty]}>
                <span className="mr-1">{difficultyIcons[tutorial.difficulty]}</span>
                {t(`difficulty.${tutorial.difficulty}`)}
              </Badge>
            </div>
            <CardTitle className="text-lg">{t(`${tutorial.id}.title`)}</CardTitle>
            <CardDescription className="flex items-center gap-2 text-sm">
              <Clock className="h-3 w-3" />
              <span>{tutorial.duration} {t('minutes')}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {t(`${tutorial.id}.description`)}
            </p>
            <div className="flex flex-wrap gap-1">
              {tutorial.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

export default function TutorialsPageClient() {
  const { t } = useTranslation('tutorials');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');

  // Filter tutorials based on search and difficulty
  const filteredTutorials = tutorials.filter((tutorial) => {
    const matchesSearch = searchQuery === '' || 
      tutorial.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t(`${tutorial.id}.title`).toLowerCase().includes(searchQuery.toLowerCase()) ||
      t(`${tutorial.id}.description`).toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDifficulty = selectedDifficulty === 'all' || tutorial.difficulty === selectedDifficulty;
    
    return matchesSearch && matchesDifficulty;
  });

  const beginnerTutorials = filteredTutorials.filter(t => t.difficulty === 'beginner');
  const intermediateTutorials = filteredTutorials.filter(t => t.difficulty === 'intermediate');
  const advancedTutorials = filteredTutorials.filter(t => t.difficulty === 'advanced');

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <motion.div 
        className="text-center mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          {t('description')}
        </p>
      </motion.div>

      {/* Search and Filters */}
      <motion.div 
        className="mb-8 space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="search"
            placeholder={t('search.placeholder')}
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Difficulty Tabs */}
      <Tabs defaultValue="all" value={selectedDifficulty} onValueChange={setSelectedDifficulty} className="mb-8">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-4">
          <TabsTrigger value="all">{t('difficulty.all')}</TabsTrigger>
          <TabsTrigger value="beginner">
            <span className="mr-1">{difficultyIcons.beginner}</span>
            {t('difficulty.beginner')}
          </TabsTrigger>
          <TabsTrigger value="intermediate">
            <span className="mr-1">{difficultyIcons.intermediate}</span>
            {t('difficulty.intermediate')}
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <span className="mr-1">{difficultyIcons.advanced}</span>
            {t('difficulty.advanced')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-8">
          <div className="space-y-8">
            {/* Beginner Section */}
            {beginnerTutorials.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <span>{difficultyIcons.beginner}</span>
                  {t('sections.beginner')}
                </h2>
                <motion.div
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {beginnerTutorials.map((tutorial) => (
                    <TutorialCard key={tutorial.id} tutorial={tutorial} />
                  ))}
                </motion.div>
              </div>
            )}

            {/* Intermediate Section */}
            {intermediateTutorials.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <span>{difficultyIcons.intermediate}</span>
                  {t('sections.intermediate')}
                </h2>
                <motion.div
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {intermediateTutorials.map((tutorial) => (
                    <TutorialCard key={tutorial.id} tutorial={tutorial} />
                  ))}
                </motion.div>
              </div>
            )}

            {/* Advanced Section */}
            {advancedTutorials.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <span>{difficultyIcons.advanced}</span>
                  {t('sections.advanced')}
                </h2>
                <motion.div
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {advancedTutorials.map((tutorial) => (
                    <TutorialCard key={tutorial.id} tutorial={tutorial} />
                  ))}
                </motion.div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="beginner" className="mt-8">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {beginnerTutorials.map((tutorial) => (
              <TutorialCard key={tutorial.id} tutorial={tutorial} />
            ))}
          </motion.div>
        </TabsContent>

        <TabsContent value="intermediate" className="mt-8">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {intermediateTutorials.map((tutorial) => (
              <TutorialCard key={tutorial.id} tutorial={tutorial} />
            ))}
          </motion.div>
        </TabsContent>

        <TabsContent value="advanced" className="mt-8">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {advancedTutorials.map((tutorial) => (
              <TutorialCard key={tutorial.id} tutorial={tutorial} />
            ))}
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* No Results */}
      {filteredTutorials.length === 0 && (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">{t('search.noResults')}</p>
        </div>
      )}

      {/* Featured Tutorials */}
      <motion.div 
        className="mt-16 p-8 bg-muted/30 rounded-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <h2 className="text-2xl font-semibold mb-4 text-center">{t('featured.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileSearch className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle className="text-lg">{t('featured.ragAndNotifications.title')}</CardTitle>
                  <CardDescription>{t('featured.ragAndNotifications.description')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Link href="/docs/tutorials/rag-knowledge-base" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  {t('featured.ragAndNotifications.tutorial1')}
                </Link>
                <Link href="/docs/tutorials/using-rag-in-client" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <FileSearch className="h-3 w-3" />
                  {t('featured.ragAndNotifications.tutorial2')}
                </Link>
                <Link href="/docs/tutorials/notifications-system" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Bell className="h-3 w-3" />
                  {t('featured.ragAndNotifications.tutorial3')}
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle className="text-lg">{t('featured.security.title')}</CardTitle>
                  <CardDescription>{t('featured.security.description')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Link href="/docs/tutorials/security-best-practices" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  {t('featured.security.tutorial1')}
                </Link>
                <Link href="/docs/tutorials/self-hosting" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {t('featured.security.tutorial2')}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Help Section */}
      <motion.div 
        className="mt-16 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <h3 className="text-xl font-semibold mb-4">{t('help.title')}</h3>
        <p className="text-muted-foreground mb-6">
          {t('help.description')}
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/docs/getting-started" className="text-primary hover:underline flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {t('help.gettingStarted')}
          </Link>
          <Link href="/docs/guides" className="text-primary hover:underline flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t('help.guides')}
          </Link>
          <Link href="/legal/contact" className="text-primary hover:underline flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('help.contact')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}