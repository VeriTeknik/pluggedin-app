'use client';

import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle,
  Code2,
  Copy,
  FileSearch,
  FileText,
  Lightbulb,
  Search,
  Terminal
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Mock screenshot component
function MockScreenshot({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-8 text-center bg-muted/30 my-4">
      <div className="max-w-md mx-auto">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground/70 mt-2">{description}</p>
        )}
      </div>
    </div>
  );
}

// Code snippet component with copy functionality
function CodeSnippet({ code, language = 'text' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4">
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 rounded-md bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

export default function UsingRAGInClientPageClient() {
  const { t } = useTranslation('tutorial-rag-client');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Link href="/docs/tutorials" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-flex items-center gap-1">
          <ArrowRight className="h-3 w-3 rotate-180" />
          {t('backToTutorials')}
        </Link>
        
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSearch className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <div className="flex items-center gap-4 mt-2">
              <Badge className="bg-yellow-500/10 text-yellow-600">
                {t('difficulty')}
              </Badge>
              <span className="text-sm text-muted-foreground">{t('duration')}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Overview */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t('overview.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{t('overview.description')}</p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <span>{t('overview.learn1')}</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <span>{t('overview.learn2')}</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <span>{t('overview.learn3')}</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <span>{t('overview.learn4')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Prerequisites */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {t('prerequisites.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>{t('prerequisites.item1')}</li>
              <li>{t('prerequisites.item2')}</li>
              <li>{t('prerequisites.item3')}</li>
              <li>{t('prerequisites.item4')}</li>
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Step 1: Understanding the Tool */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mb-8"
      >
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            1
          </div>
          {t('step1.title')}
        </h2>
        
        <p className="text-muted-foreground mb-4">{t('step1.description')}</p>
        
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            {t('step1.tip')}
          </AlertDescription>
        </Alert>

        <MockScreenshot 
          title={t('step1.screenshot')}
          description={t('step1.screenshotDesc')}
        />
      </motion.div>

      {/* Step 2: Basic Queries */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mb-8"
      >
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            2
          </div>
          {t('step2.title')}
        </h2>
        
        <p className="text-muted-foreground mb-4">{t('step2.description')}</p>
        
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">{t('step2.example1.title')}</h3>
            <CodeSnippet code={`Use the pluggedin_rag_query tool to search for "API authentication"`} />
            <MockScreenshot 
              title={t('step2.example1.screenshot')}
              description={t('step2.example1.screenshotDesc')}
            />
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t('step2.example2.title')}</h3>
            <CodeSnippet code={`Query my documents about "docker deployment configuration"`} />
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t('step2.example3.title')}</h3>
            <CodeSnippet code={`Find all mentions of "security best practices" in my uploaded documents`} />
          </div>
        </div>
      </motion.div>

      {/* Step 3: Advanced Queries */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mb-8"
      >
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            3
          </div>
          {t('step3.title')}
        </h2>
        
        <p className="text-muted-foreground mb-4">{t('step3.description')}</p>
        
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">{t('step3.contextual.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeSnippet code={`Based on our project documentation, what are the recommended database indexes for the user table?`} />
            <p className="text-sm text-muted-foreground mt-2">{t('step3.contextual.description')}</p>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">{t('step3.comparison.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeSnippet code={`Compare the authentication methods described in our API docs versus the security guidelines document`} />
            <p className="text-sm text-muted-foreground mt-2">{t('step3.comparison.description')}</p>
          </CardContent>
        </Card>

        <MockScreenshot 
          title={t('step3.screenshot')}
          description={t('step3.screenshotDesc')}
        />
      </motion.div>

      {/* Step 4: Best Practices */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mb-8"
      >
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            4
          </div>
          {t('step4.title')}
        </h2>
        
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="h-5 w-5" />
                {t('step4.specific.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t('step4.specific.description')}</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm">{t('step4.specific.good')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm">{t('step4.specific.bad')}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                {t('step4.context.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t('step4.context.description')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                {t('step4.combine.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t('step4.combine.description')}</p>
              <CodeSnippet 
                code={`1. Use pluggedin_rag_query to find deployment steps
2. Follow the instructions found
3. Use pluggedin_send_notification to alert team when complete`} 
              />
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Common Issues */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mb-8"
      >
        <h2 className="text-2xl font-semibold mb-4">{t('issues.title')}</h2>
        
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('issues.noResults.title')}</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>{t('issues.noResults.solution1')}</li>
                <li>{t('issues.noResults.solution2')}</li>
                <li>{t('issues.noResults.solution3')}</li>
              </ul>
            </AlertDescription>
          </Alert>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('issues.toolNotAvailable.title')}</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>{t('issues.toolNotAvailable.solution1')}</li>
                <li>{t('issues.toolNotAvailable.solution2')}</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      </motion.div>

      {/* Next Steps */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              {t('nextSteps.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{t('nextSteps.description')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/docs/tutorials/notifications-system">
                <Button variant="outline" className="w-full justify-start">
                  <Code2 className="h-4 w-4 mr-2" />
                  {t('nextSteps.notifications')}
                </Button>
              </Link>
              <Link href="/docs/tutorials/rag-knowledge-base">
                <Button variant="outline" className="w-full justify-start">
                  <FileSearch className="h-4 w-4 mr-2" />
                  {t('nextSteps.buildingRag')}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}