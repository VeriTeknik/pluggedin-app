'use client';

import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle,
  Copy,
  FileText,
  Info,
  Lightbulb,
  Mail,
  MessageSquare,
  Settings,
  Zap
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

export default function NotificationsSystemPageClient() {
  const { t } = useTranslation('tutorial-notifications');

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
            <Bell className="h-6 w-6" />
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
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Step 1: Enable Notifications */}
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
        
        <MockScreenshot 
          title={t('step1.screenshot')}
          description={t('step1.screenshotDesc')}
        />

        <Alert className="mt-4">
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t('step1.note')}
          </AlertDescription>
        </Alert>
      </motion.div>

      {/* Step 2: Configure Email (Optional) */}
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
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {t('step2.emailSetup.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>{t('step2.emailSetup.step1')}</li>
              <li>{t('step2.emailSetup.step2')}</li>
              <li>{t('step2.emailSetup.step3')}</li>
            </ol>
            <MockScreenshot 
              title={t('step2.screenshot')}
              description={t('step2.screenshotDesc')}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Step 3: Using the Notification Tool */}
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
        
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">{t('step3.tabs.basic')}</TabsTrigger>
            <TabsTrigger value="severity">{t('step3.tabs.severity')}</TabsTrigger>
            <TabsTrigger value="email">{t('step3.tabs.email')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('step3.basic.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3">{t('step3.basic.description')}</p>
                <CodeSnippet code={`Use pluggedin_send_notification to send "Task completed successfully!"`} />
                <MockScreenshot 
                  title={t('step3.basic.screenshot')}
                  description={t('step3.basic.screenshotDesc')}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="severity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('step3.severity.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3">{t('step3.severity.description')}</p>
                <div className="space-y-3">
                  <div>
                    <Badge className="bg-blue-500/10 text-blue-600 mb-2">INFO</Badge>
                    <CodeSnippet code={`Send notification "Analysis complete" with severity INFO`} />
                  </div>
                  <div>
                    <Badge className="bg-green-500/10 text-green-600 mb-2">SUCCESS</Badge>
                    <CodeSnippet code={`Send notification "Deployment successful!" with severity SUCCESS`} />
                  </div>
                  <div>
                    <Badge className="bg-yellow-500/10 text-yellow-600 mb-2">WARNING</Badge>
                    <CodeSnippet code={`Send notification "Low disk space detected" with severity WARNING`} />
                  </div>
                  <div>
                    <Badge className="bg-red-500/10 text-red-600 mb-2">ALERT</Badge>
                    <CodeSnippet code={`Send notification "Critical error in production!" with severity ALERT`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="email" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('step3.email.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3">{t('step3.email.description')}</p>
                <CodeSnippet code={`Send notification "Weekly report ready" with email delivery enabled`} />
                <Alert className="mt-3">
                  <Mail className="h-4 w-4" />
                  <AlertDescription>
                    {t('step3.email.note')}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Step 4: Practical Examples */}
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
                <Zap className="h-5 w-5" />
                {t('step4.example1.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-3">{t('step4.example1.description')}</p>
              <CodeSnippet 
                code={`1. Query RAG for deployment checklist
2. Execute deployment steps
3. Send notification "Deployment to production complete" with SUCCESS severity
4. If errors occur, send ALERT with email enabled`} 
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {t('step4.example2.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-3">{t('step4.example2.description')}</p>
              <CodeSnippet 
                code={`After analyzing logs:
- If errors found: Send "Found 3 critical errors in logs" with ALERT
- If warnings: Send "5 warnings detected" with WARNING
- If clean: Send "Log analysis complete - no issues" with SUCCESS`} 
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {t('step4.example3.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-3">{t('step4.example3.description')}</p>
              <CodeSnippet 
                code={`Monitor system resources and:
- CPU > 80%: Send "High CPU usage: 85%" with WARNING
- Memory > 90%: Send "Critical memory usage: 92%" with ALERT + email
- Disk full: Send "Disk space critical: 2GB remaining" with ALERT + email`} 
              />
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Best Practices */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mb-8"
      >
        <h2 className="text-2xl font-semibold mb-4">{t('bestPractices.title')}</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('bestPractices.meaningful.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('bestPractices.meaningful.description')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('bestPractices.severity.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('bestPractices.severity.description')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('bestPractices.email.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('bestPractices.email.description')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('bestPractices.context.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('bestPractices.context.description')}</p>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Common Issues */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mb-8"
      >
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            <strong>{t('tip.title')}</strong>
            <p className="mt-2">{t('tip.description')}</p>
          </AlertDescription>
        </Alert>
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
              <Link href="/docs/tutorials/api-integration">
                <Button variant="outline" className="w-full justify-start">
                  <Zap className="h-4 w-4 mr-2" />
                  {t('nextSteps.api')}
                </Button>
              </Link>
              <Link href="/docs/tutorials/team-collaboration">
                <Button variant="outline" className="w-full justify-start">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t('nextSteps.team')}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}