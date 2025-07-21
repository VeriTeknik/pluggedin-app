'use client';

import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  CheckCircle,
  Code2,
  Copy,
  FileText,
  Globe,
  Key,
  Package,
  Plug,
  Rocket,
  Settings,
  Shield,
  Terminal,
  UserPlus,
  Zap
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

// Code snippet component with copy functionality
function CodeSnippet({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
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

// Mock screenshot placeholder component
function MockScreenshot({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-8 text-center bg-muted/30">
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

export default function GettingStartedPageClient() {
  const { t } = useTranslation('getting-started');

  const prerequisites = [
    { icon: Package, key: 'nodejs' },
    { icon: UserPlus, key: 'account' },
    { icon: Terminal, key: 'mcpClient' },
    { icon: Code2, key: 'commandLine' },
  ];

  const quickSteps = [
    { icon: UserPlus, key: 'createAccount', number: '1' },
    { icon: Key, key: 'generateKey', number: '2' },
    { icon: Terminal, key: 'installProxy', number: '3' },
    { icon: Plug, key: 'configureClient', number: '4' },
    { icon: CheckCircle, key: 'testConnection', number: '5' },
  ];

  const concepts = [
    { icon: Plug, key: 'mcpServers', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
    { icon: Settings, key: 'projectsProfiles', color: 'text-green-500', bgColor: 'bg-green-500/10' },
    { icon: Package, key: 'collections', color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
    { icon: Zap, key: 'mcpProxy', color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  ];

  const advancedFeatures = [
    { icon: BookOpen, key: 'documentLibrary' },
    { icon: Globe, key: 'notifications' },
    { icon: FileText, key: 'customInstructions' },
    { icon: Shield, key: 'security' },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Hero Section */}
      <motion.div 
        className="text-center mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t('subtitle')}
        </p>
      </motion.div>

      {/* Prerequisites Section */}
      <motion.section 
        className="mb-12"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-2xl font-semibold mb-6">{t('prerequisites.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prerequisites.map((item) => (
            <motion.div key={item.key} variants={itemVariants}>
              <Card>
                <CardContent className="flex items-center p-4">
                  <item.icon className="h-5 w-5 text-primary mr-3" />
                  <span className="text-sm">{t(`prerequisites.${item.key}`)}</span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Quick Start Section */}
      <motion.section 
        className="mb-12"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
          <Rocket className="h-6 w-6 mr-2 text-primary" />
          {t('quickStart.title')}
        </h2>

        <div className="space-y-8">
          {quickSteps.map((step, index) => (
            <motion.div key={step.key} variants={itemVariants}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold mr-4">
                        {step.number}
                      </div>
                      <CardTitle className="text-lg">{t(`quickStart.${step.key}.title`)}</CardTitle>
                    </div>
                    <step.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">{t(`quickStart.${step.key}.description`)}</p>
                  
                  {/* Step-specific content */}
                  {step.key === 'createAccount' && (
                    <div className="space-y-4">
                      <div className="bg-muted rounded-lg p-8">
                        <Image
                          src="/images/setup-guide/getting-started/signup-page.png"
                          alt="Plugged.in signup page showing GitHub and email options"
                          width={800}
                          height={400}
                          className="rounded-lg w-full"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button asChild>
                          <Link href="/login">{t('quickStart.createAccount.action')}</Link>
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {step.key === 'generateKey' && (
                    <div className="space-y-4">
                      <div className="bg-muted rounded-lg p-8">
                        <Image
                          src="/images/setup-guide/getting-started/generate-key.png"
                          alt="API key generation interface showing where to create and copy your API key"
                          width={800}
                          height={400}
                          className="rounded-lg w-full"
                        />
                      </div>
                      <p className="text-sm text-yellow-600 dark:text-yellow-400">
                        {t('quickStart.generateKey.warning')}
                      </p>
                    </div>
                  )}
                  
                  {step.key === 'installProxy' && (
                    <div className="space-y-4">
                      <CodeSnippet code="npx @pluggedin/pluggedin-mcp-proxy@latest --help" />
                      <p className="text-sm text-muted-foreground">
                        {t('quickStart.installProxy.note')}
                      </p>
                    </div>
                  )}
                  
                  {step.key === 'configureClient' && (
                    <Tabs defaultValue="claude" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="claude">Claude Desktop</TabsTrigger>
                        <TabsTrigger value="cursor">Cursor</TabsTrigger>
                      </TabsList>
                      <TabsContent value="claude" className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          {t('quickStart.configureClient.claude.path')}
                        </p>
                        <CodeSnippet 
                          language="json"
                          code={`{
  "mcpServers": {
    "pluggedin": {
      "command": "npx",
      "args": ["-y", "@pluggedin/pluggedin-mcp-proxy@latest"],
      "env": {
        "PLUGGEDIN_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}`}
                        />
                      </TabsContent>
                      <TabsContent value="cursor" className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          {t('quickStart.configureClient.cursor.instruction')}
                        </p>
                        <CodeSnippet 
                          code="npx -y @pluggedin/pluggedin-mcp-proxy@latest --pluggedin-api-key YOUR_API_KEY_HERE"
                        />
                      </TabsContent>
                    </Tabs>
                  )}
                  
                  {step.key === 'testConnection' && (
                    <div className="space-y-4">
                      <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                        {(t('quickStart.testConnection.tools', { returnObjects: true }) as string[]).map((tool: string, idx: number) => (
                          <li key={idx}>{tool}</li>
                        ))}
                      </ul>
                      <div className="bg-muted rounded-lg p-8">
                        <Image
                          src="/images/setup-guide/getting-started/mcp-tools.png"
                          alt="MCP client showing available plugged.in tools"
                          width={800}
                          height={400}
                          className="rounded-lg w-full"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Core Concepts Section */}
      <motion.section 
        className="mb-12"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-2xl font-semibold mb-6">{t('concepts.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {concepts.map((concept) => (
            <motion.div key={concept.key} variants={itemVariants}>
              <Card className="h-full">
                <CardHeader>
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${concept.bgColor} mb-4`}>
                    <concept.icon className={`h-6 w-6 ${concept.color}`} />
                  </div>
                  <CardTitle>{t(`concepts.${concept.key}.title`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    {t(`concepts.${concept.key}.description`)}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* First Steps Section */}
      <motion.section 
        className="mb-12"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-2xl font-semibold mb-6">{t('firstSteps.title')}</h2>
        
        <div className="space-y-8">
          {/* Add Server */}
          <Card>
            <CardHeader>
              <CardTitle>{t('firstSteps.addServer.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{t('firstSteps.addServer.description')}</p>
              <div className="bg-muted rounded-lg p-8">
                <Image
                  src="/images/setup-guide/getting-started/add-server.png"
                  alt="MCP Server configuration form showing how to add a new server"
                  width={800}
                  height={400}
                  className="rounded-lg w-full"
                />
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">{t('firstSteps.addServer.example')}</p>
                <CodeSnippet 
                  language="text"
                  code={`Name: Filesystem Access
Type: NPX
Command: @modelcontextprotocol/server-filesystem
Arguments: /path/to/allowed/directory`}
                />
              </div>
            </CardContent>
          </Card>

          {/* Test in Playground */}
          <Card>
            <CardHeader>
              <CardTitle>{t('firstSteps.playground.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{t('firstSteps.playground.description')}</p>
              <div className="bg-muted rounded-lg p-8">
                <Image
                  src="/images/setup-guide/getting-started/playground.png"
                  alt="MCP Playground interface showing chat interface and server tools"
                  width={800}
                  height={400}
                  className="rounded-lg w-full"
                />
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {(t('firstSteps.playground.features', { returnObjects: true }) as string[]).map((feature: string, idx: number) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Create Collection */}
          <Card>
            <CardHeader>
              <CardTitle>{t('firstSteps.collection.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t('firstSteps.collection.description')}</p>
            </CardContent>
          </Card>

          {/* Share */}
          <Card>
            <CardHeader>
              <CardTitle>{t('firstSteps.share.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t('firstSteps.share.description')}</p>
            </CardContent>
          </Card>
        </div>
      </motion.section>

      {/* Advanced Features Section */}
      <motion.section 
        className="mb-12"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-2xl font-semibold mb-6">{t('advanced.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {advancedFeatures.map((feature) => (
            <motion.div key={feature.key} variants={itemVariants}>
              <Card>
                <CardHeader>
                  <div className="flex items-start">
                    <feature.icon className="h-5 w-5 text-primary mr-3 mt-1" />
                    <div>
                      <CardTitle className="text-lg">{t(`advanced.${feature.key}.title`)}</CardTitle>
                      <CardDescription className="mt-2">
                        {t(`advanced.${feature.key}.description`)}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Troubleshooting Section */}
      <motion.section 
        className="mb-12"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-2xl font-semibold mb-6">{t('troubleshooting.title')}</h2>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-6">
              {['sessionNotFound', 'serversNotInit', 'ragNotWorking'].map((issue) => (
                <div key={issue}>
                  <h3 className="font-semibold mb-2">{t(`troubleshooting.${issue}.title`)}</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    {(t(`troubleshooting.${issue}.solutions`, { returnObjects: true }) as string[]).map((solution: string, idx: number) => (
                      <li key={idx}>{solution}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* Next Steps Section */}
      <motion.section 
        className="mb-12"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-2xl font-semibold mb-6">{t('nextSteps.title')}</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Explore Guides */}
          <Card>
            <CardHeader>
              <BookOpen className="h-8 w-8 text-primary mb-2" />
              <CardTitle>{t('nextSteps.guides.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(t('nextSteps.guides.links', { returnObjects: true }) as Array<{text: string, href: string}>).map((link: {text: string, href: string}, idx: number) => (
                  <li key={idx}>
                    <Link href={link.href} className="text-sm text-primary hover:underline flex items-center">
                      {link.text}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* API Documentation */}
          <Card>
            <CardHeader>
              <Code2 className="h-8 w-8 text-primary mb-2" />
              <CardTitle>{t('nextSteps.api.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(t('nextSteps.api.links', { returnObjects: true }) as Array<{text: string, href: string}>).map((link: {text: string, href: string}, idx: number) => (
                  <li key={idx}>
                    <Link href={link.href} className="text-sm text-primary hover:underline flex items-center">
                      {link.text}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Community */}
          <Card>
            <CardHeader>
              <Globe className="h-8 w-8 text-primary mb-2" />
              <CardTitle>{t('nextSteps.community.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(t('nextSteps.community.links', { returnObjects: true }) as Array<{text: string, href: string, external?: boolean}>).map((link: {text: string, href: string, external?: boolean}, idx: number) => (
                  <li key={idx}>
                    <a 
                      href={link.href} 
                      className="text-sm text-primary hover:underline flex items-center"
                      {...(link.external && { target: '_blank', rel: 'noopener noreferrer' })}
                    >
                      {link.text}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </motion.section>

      {/* Quick Reference Section */}
      <motion.section 
        className="mb-12 bg-muted/30 rounded-lg p-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="text-2xl font-semibold mb-6">{t('quickReference.title')}</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold mb-3">{t('quickReference.commands.title')}</h3>
            <div className="space-y-3">
              <CodeSnippet code="# Install MCP Proxy
npx @pluggedin/pluggedin-mcp-proxy@latest

# Generate encryption key (self-hosted)
pnpm generate-encryption-key

# Run migrations (self-hosted)
pnpm db:migrate" />
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">{t('quickReference.config.title')}</h3>
            <Tabs defaultValue="basic" className="w-full">
              <TabsList>
                <TabsTrigger value="basic">{t('quickReference.config.basic')}</TabsTrigger>
                <TabsTrigger value="advanced">{t('quickReference.config.advanced')}</TabsTrigger>
              </TabsList>
              <TabsContent value="basic">
                <CodeSnippet 
                  language="json"
                  code={`{
  "mcpServers": {
    "pluggedin": {
      "command": "npx",
      "args": ["-y", "@pluggedin/pluggedin-mcp-proxy@latest"],
      "env": {
        "PLUGGEDIN_API_KEY": "your-api-key"
      }
    }
  }
}`}
                />
              </TabsContent>
              <TabsContent value="advanced">
                <CodeSnippet 
                  language="json"
                  code={`{
  "mcpServers": {
    "pluggedin": {
      "command": "npx",
      "args": [
        "-y", 
        "@pluggedin/pluggedin-mcp-proxy@latest",
        "--profile", "production",
        "--enable-notifications"
      ],
      "env": {
        "PLUGGEDIN_API_KEY": "your-api-key",
        "PLUGGEDIN_API_BASE_URL": "https://your-instance.com"
      }
    }
  }
}`}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </motion.section>

      {/* Final CTA */}
      <motion.div 
        className="text-center py-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <h3 className="text-xl font-semibold mb-4">{t('cta.title')}</h3>
        <div className="flex gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/login">
              {t('cta.getStarted')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/docs">
              {t('cta.browseDocs')}
            </Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}