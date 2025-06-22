'use client';

import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Copy,
  FileText,
  Lightbulb,
  Package,
  Plus,
  Server,
  Settings,
  Terminal
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

export function FirstMCPServerPageClient() {
  const { t } = useTranslation('tutorial-first-mcp-server');

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
            <Server className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <div className="flex items-center gap-4 mt-2">
              <Badge className="bg-green-500/10 text-green-600">
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
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Step 1: Understanding MCP Servers */}
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
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('step1.whatIs.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3">{t('step1.whatIs.description')}</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>{t('step1.whatIs.point1')}</li>
              <li>{t('step1.whatIs.point2')}</li>
              <li>{t('step1.whatIs.point3')}</li>
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Step 2: Navigating to MCP Servers */}
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
        
        <MockScreenshot 
          title={t('step2.screenshot')}
          description={t('step2.screenshotDesc')}
        />

        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            {t('step2.tip')}
          </AlertDescription>
        </Alert>
      </motion.div>

      {/* Step 3: Adding Your First Server */}
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
        
        <Tabs defaultValue="official" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="official">{t('step3.tabs.official')}</TabsTrigger>
            <TabsTrigger value="custom">{t('step3.tabs.custom')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="official" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('step3.official.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>{t('step3.official.step1')}</li>
                  <li>{t('step3.official.step2')}</li>
                  <li>{t('step3.official.step3')}</li>
                  <li>{t('step3.official.step4')}</li>
                </ol>
                <MockScreenshot 
                  title={t('step3.official.screenshot')}
                  description={t('step3.official.screenshotDesc')}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="custom" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('step3.custom.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3">{t('step3.custom.description')}</p>
                <CodeSnippet 
                  code={`npx @modelcontextprotocol/create-server my-first-server`}
                  language="bash"
                />
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mt-4">
                  <li>{t('step3.custom.step1')}</li>
                  <li>{t('step3.custom.step2')}</li>
                  <li>{t('step3.custom.step3')}</li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Step 4: Configuring Your Server */}
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
        
        <p className="text-muted-foreground mb-4">{t('step4.description')}</p>
        
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {t('step4.settings.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-3">{t('step4.settings.description')}</p>
              <CodeSnippet 
                code={`{
  "name": "Filesystem Server",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"],
  "env": {
    "NODE_ENV": "production"
  }
}`}
                language="json"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                {t('step4.env.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t('step4.env.description')}</p>
              <Alert className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('step4.env.note')}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Step 5: Testing Your Server */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mb-8"
      >
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            5
          </div>
          {t('step5.title')}
        </h2>
        
        <p className="text-muted-foreground mb-4">{t('step5.description')}</p>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('step5.test.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>{t('step5.test.step1')}</li>
              <li>{t('step5.test.step2')}</li>
              <li>{t('step5.test.step3')}</li>
              <li>{t('step5.test.step4')}</li>
            </ol>
            <MockScreenshot 
              title={t('step5.screenshot')}
              description={t('step5.screenshotDesc')}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Common Issues */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mb-8"
      >
        <h2 className="text-2xl font-semibold mb-4">{t('issues.title')}</h2>
        
        <div className="space-y-4">
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('issues.connection.title')}</strong>
              <p className="mt-2">{t('issues.connection.description')}</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>{t('issues.connection.solution1')}</li>
                <li>{t('issues.connection.solution2')}</li>
                <li>{t('issues.connection.solution3')}</li>
              </ul>
            </AlertDescription>
          </Alert>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('issues.tools.title')}</strong>
              <p className="mt-2">{t('issues.tools.description')}</p>
            </AlertDescription>
          </Alert>
        </div>
      </motion.div>

      {/* Next Steps */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
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
              <Link href="/docs/tutorials/sharing-with-community">
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('nextSteps.sharing')}
                </Button>
              </Link>
              <Link href="/docs/tutorials/custom-mcp-server">
                <Button variant="outline" className="w-full justify-start">
                  <Terminal className="h-4 w-4 mr-2" />
                  {t('nextSteps.custom')}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}