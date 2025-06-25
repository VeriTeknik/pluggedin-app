'use client';

import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  ChevronLeft,
  Clock,
  Download,
  Globe,
  Lock,
  Package,
  Search,
  Sparkles,
  TrendingUp,
  User,
  Zap
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  slug: string;
}

const articleData = {
  'send-notifications-from-ai': {
    icon: Bell,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    category: 'feature',
    readTime: '5 min',
  },
  'document-context-rag': {
    icon: BookOpen,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    category: 'feature',
    readTime: '8 min',
  },
  'encryption-security': {
    icon: Lock,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    category: 'security',
    readTime: '3 min',
  },
  'lightning-fast-startup': {
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    category: 'performance',
    readTime: '4 min',
  },
  'public-profile': {
    icon: User,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    category: 'social',
    readTime: '5 min',
  },
  'import-export-setup': {
    icon: Download,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    category: 'feature',
    readTime: '6 min',
  },
  'multilingual-support': {
    icon: Globe,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
    category: 'feature',
    readTime: '3 min',
  },
  'discover-capabilities': {
    icon: Search,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    category: 'feature',
    readTime: '7 min',
  },
  'share-collections': {
    icon: Package,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    category: 'feature',
    readTime: '6 min',
  },
  'activity-tracking': {
    icon: TrendingUp,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    category: 'feature',
    readTime: '4 min',
  },
  'customize-experience': {
    icon: Sparkles,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    category: 'feature',
    readTime: '7 min',
  },
};

export default function WhatsNewArticleClient({ slug }: Props) {
  const { t } = useTranslation(['whatsNew', 'common']);
  const article = articleData[slug as keyof typeof articleData];
  const Icon = article.icon;

  const renderArticleContent = () => {
    switch (slug) {
      case 'send-notifications-from-ai':
        return (
          <>
            {/* Hero Image */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/send-notifications-from-ai/email-notification.png"
                alt="Email notification example"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.send-notifications-from-ai.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.send-notifications-from-ai.content.howToTitle')}</h2>
            
            <div className="bg-muted rounded-lg p-6 mb-6">
              <pre className="text-sm">
{`Use the tool: pluggedin_send_notification

Parameters:
- title: "Your notification title"
- message: "Detailed message content"
- type: "SUCCESS" | "WARNING" | "INFO" | "ALERT"`}
              </pre>
            </div>

            {/* MCP Tool Usage Screenshot */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/send-notifications-from-ai/mcp-tool-usage.png"
                alt="MCP notification tool being used in Claude/Cursor"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.send-notifications-from-ai.content.emailSetupTitle')}</h2>
            <ol className="list-decimal list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.send-notifications-from-ai.content.emailStep1')}</li>
              <li>{t('whatsNew:articles.send-notifications-from-ai.content.emailStep2')}</li>
              <li>{t('whatsNew:articles.send-notifications-from-ai.content.emailStep3')}</li>
            </ol>

            {/* Email Settings Screenshot */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/send-notifications-from-ai/email-settings.png"
                alt="Email notification settings configuration page"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.send-notifications-from-ai.content.useCasesTitle')}</h2>
            <ul className="list-disc list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.send-notifications-from-ai.content.useCase1')}</li>
              <li>{t('whatsNew:articles.send-notifications-from-ai.content.useCase2')}</li>
              <li>{t('whatsNew:articles.send-notifications-from-ai.content.useCase3')}</li>
            </ul>

            <h2 className="text-2xl font-semibold mb-4">Viewing Notifications</h2>
            <p className="mb-4">
              All notifications will appear in your notification center, accessible via the bell icon in the top navigation bar.
              You can filter notifications by type and mark them as read.
            </p>

            {/* Notification Bell Screenshot */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/send-notifications-from-ai/notification-bell.png"
                alt="Notification center showing different types of notifications"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <div className="flex items-center justify-between mt-8 pt-4 border-t">
              <Link
                href="/docs/whats-new"
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "text-muted-foreground"
                )}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to What&apos;s New
              </Link>
            </div>
          </>
        );

      case 'document-context-rag':
        return (
          <>
            {/* Document Library Interface */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/document-context-rag/library-interface.png"
                alt="Document library interface showing uploaded files and search"
                width={1920}
                height={1080}
                className="rounded-lg w-full"
                quality={100}
              />
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.document-context-rag.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.document-context-rag.content.uploadTitle')}</h2>
            
            {/* Upload Dialog */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/document-context-rag/upload-dialog.png"
                alt="Document upload dialog with drag and drop interface"
                width={1920}
                height={1080}
                className="rounded-lg w-full"
                quality={100}
              />
            </div>

            <p className="mb-6">{t('whatsNew:articles.document-context-rag.content.uploadDescription')}</p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.document-context-rag.content.queryTitle')}</h2>

            <div className="bg-muted rounded-lg p-6 mb-6">
              <pre className="text-sm">
{`Use the tool: pluggedin_rag_query

Example:
"Find information about API authentication in my docs"`}
              </pre>
            </div>

            {/* RAG Query Screenshot */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/document-context-rag/rag-query.png"
                alt="RAG query being executed and showing results"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.document-context-rag.content.formatsTitle')}</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>PDF documents</li>
              <li>Text files (.txt, .md)</li>
              <li>Word documents (.docx)</li>
              <li>Code files</li>
            </ul>
          </>
        );

      case 'encryption-security':
        return (
          <>
            {/* Hero Image Placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[ICON: Security shield with lock]</p>
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.encryption-security.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.encryption-security.content.howItWorksTitle')}</h2>
            
            {/* Diagram placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[INFOGRAPHIC: How encryption works]</p>
            </div>

            <ul className="list-disc list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.encryption-security.content.feature1')}</li>
              <li>{t('whatsNew:articles.encryption-security.content.feature2')}</li>
              <li>{t('whatsNew:articles.encryption-security.content.feature3')}</li>
            </ul>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.encryption-security.content.sharingTitle')}</h2>
            
            {/* Screenshot placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Shared server template]</p>
            </div>

            <p>{t('whatsNew:articles.encryption-security.content.sharingDescription')}</p>
          </>
        );

      case 'lightning-fast-startup':
        return (
          <>
            {/* Hero Image Placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[ANIMATION: Instant server connection visualization]</p>
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.lightning-fast-startup.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.lightning-fast-startup.content.howItWorksTitle')}</h2>
            <ul className="list-disc list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.lightning-fast-startup.content.feature1')}</li>
              <li>{t('whatsNew:articles.lightning-fast-startup.content.feature2')}</li>
              <li>{t('whatsNew:articles.lightning-fast-startup.content.feature3')}</li>
            </ul>

            {/* Screenshot placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Server connection status indicators]</p>
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.lightning-fast-startup.content.benefitsTitle')}</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>{t('whatsNew:articles.lightning-fast-startup.content.benefit1')}</li>
              <li>{t('whatsNew:articles.lightning-fast-startup.content.benefit2')}</li>
              <li>{t('whatsNew:articles.lightning-fast-startup.content.benefit3')}</li>
            </ul>
          </>
        );

      case 'public-profile':
        return (
          <>
            {/* Hero Image */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/public-profile/profile-page.png"
                alt="Example public profile page showing user information and shared content"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.public-profile.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.public-profile.content.featuresTitle')}</h2>
            <ul className="list-disc list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.public-profile.content.feature1')}</li>
              <li>{t('whatsNew:articles.public-profile.content.feature2')}</li>
              <li>{t('whatsNew:articles.public-profile.content.feature3')}</li>
              <li>{t('whatsNew:articles.public-profile.content.feature4')}</li>
            </ul>

            {/* Settings Screenshot */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/public-profile/profile-settings.png"
                alt="Profile settings page showing customization options"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.public-profile.content.setupTitle')}</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>{t('whatsNew:articles.public-profile.content.setupStep1')}</li>
              <li>{t('whatsNew:articles.public-profile.content.setupStep2')}</li>
              <li>{t('whatsNew:articles.public-profile.content.setupStep3')}</li>
            </ol>
          </>
        );

      case 'import-export-setup':
        return (
          <>
            {/* Hero Image */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/import-export-setup/collection-actions.png"
                alt="Export and Import buttons in collection view"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.import-export-setup.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.import-export-setup.content.exportTitle')}</h2>
            <ol className="list-decimal list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.import-export-setup.content.exportStep1')}</li>
              <li>{t('whatsNew:articles.import-export-setup.content.exportStep2')}</li>
              <li>{t('whatsNew:articles.import-export-setup.content.exportStep3')}</li>
            </ol>

            {/* Import Dialog Screenshot */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/import-export-setup/import-dialog.png"
                alt="Import collection dialog showing file selection interface"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.import-export-setup.content.importTitle')}</h2>
            <ol className="list-decimal list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.import-export-setup.content.importStep1')}</li>
              <li>{t('whatsNew:articles.import-export-setup.content.importStep2')}</li>
              <li>{t('whatsNew:articles.import-export-setup.content.importStep3')}</li>
            </ol>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.import-export-setup.content.useCasesTitle')}</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>{t('whatsNew:articles.import-export-setup.content.useCase1')}</li>
              <li>{t('whatsNew:articles.import-export-setup.content.useCase2')}</li>
              <li>{t('whatsNew:articles.import-export-setup.content.useCase3')}</li>
            </ul>
          </>
        );

      case 'multilingual-support':
        return (
          <>
            {/* Hero Image */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/multilingual-support/language-selector.png"
                alt="Language selector showing 6 available languages"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.multilingual-support.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.multilingual-support.content.supportedLanguages')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-muted rounded-lg p-4 text-center">🇬🇧 English</div>
              <div className="bg-muted rounded-lg p-4 text-center">🇹🇷 Türkçe</div>
              <div className="bg-muted rounded-lg p-4 text-center">🇨🇳 中文</div>
              <div className="bg-muted rounded-lg p-4 text-center">🇮🇳 हिन्दी</div>
              <div className="bg-muted rounded-lg p-4 text-center">🇯🇵 日本語</div>
              <div className="bg-muted rounded-lg p-4 text-center">🇳🇱 Nederlands</div>
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.multilingual-support.content.changeLanguageTitle')}</h2>
            <ol className="list-decimal list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.multilingual-support.content.step1')}</li>
              <li>{t('whatsNew:articles.multilingual-support.content.step2')}</li>
              <li>{t('whatsNew:articles.multilingual-support.content.step3')}</li>
            </ol>

            {/* Settings Screenshot */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/multilingual-support/language-settings.png"
                alt="Settings page showing language selection options"
                width={800}
                height={400}
                className="rounded-lg w-full"
              />
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.multilingual-support.content.contributeTitle')}</h2>
            <p>{t('whatsNew:articles.multilingual-support.content.contributeText')}</p>
          </>
        );

      case 'discover-capabilities':
        return (
          <>
            {/* Hero Image */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/discover-capabilities/plugin-management.png"
                alt="Plugin Management interface showing MCP servers overview"
                width={1920}
                height={1080}
                className="rounded-lg w-full"
                quality={100}
              />
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.discover-capabilities.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.discover-capabilities.content.capabilitiesTitle')}</h2>
            <ul className="list-disc list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.discover-capabilities.content.capability1')}</li>
              <li>{t('whatsNew:articles.discover-capabilities.content.capability2')}</li>
              <li>{t('whatsNew:articles.discover-capabilities.content.capability3')}</li>
              <li>{t('whatsNew:articles.discover-capabilities.content.capability4')}</li>
            </ul>

            {/* Server Details Screenshot */}
            <div className="bg-muted rounded-lg p-8 mb-8">
              <Image
                src="/images/whats-new/discover-capabilities/server-details.png"
                alt="Individual server details showing capabilities and actions"
                width={1920}
                height={1080}
                className="rounded-lg w-full"
                quality={100}
              />
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.discover-capabilities.content.discoveryTitle')}</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>{t('whatsNew:articles.discover-capabilities.content.discoveryStep1')}</li>
              <li>{t('whatsNew:articles.discover-capabilities.content.discoveryStep2')}</li>
              <li>{t('whatsNew:articles.discover-capabilities.content.discoveryStep3')}</li>
            </ol>
          </>
        );

      case 'share-collections':
        return (
          <>
            {/* Hero Image Placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Collection sharing interface]</p>
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.share-collections.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.share-collections.content.whatAreCollectionsTitle')}</h2>
            <p className="mb-6">{t('whatsNew:articles.share-collections.content.whatAreCollectionsText')}</p>

            {/* Screenshot placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Creating a collection]</p>
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.share-collections.content.createCollectionTitle')}</h2>
            <ol className="list-decimal list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.share-collections.content.createStep1')}</li>
              <li>{t('whatsNew:articles.share-collections.content.createStep2')}</li>
              <li>{t('whatsNew:articles.share-collections.content.createStep3')}</li>
              <li>{t('whatsNew:articles.share-collections.content.createStep4')}</li>
            </ol>

            {/* Screenshot placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Share collection dialog]</p>
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.share-collections.content.sharingTitle')}</h2>
            <ul className="list-disc list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.share-collections.content.sharingFeature1')}</li>
              <li>{t('whatsNew:articles.share-collections.content.sharingFeature2')}</li>
              <li>{t('whatsNew:articles.share-collections.content.sharingFeature3')}</li>
            </ul>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.share-collections.content.examplesTitle')}</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>{t('whatsNew:articles.share-collections.content.example1')}</li>
              <li>{t('whatsNew:articles.share-collections.content.example2')}</li>
              <li>{t('whatsNew:articles.share-collections.content.example3')}</li>
              <li>{t('whatsNew:articles.share-collections.content.example4')}</li>
            </ul>
          </>
        );

      case 'activity-tracking':
        return (
          <>
            {/* Hero Image Placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Activity dashboard with charts]</p>
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.activity-tracking.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.activity-tracking.content.trackedOperationsTitle')}</h2>
            <ul className="list-disc list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.activity-tracking.content.operation1')}</li>
              <li>{t('whatsNew:articles.activity-tracking.content.operation2')}</li>
              <li>{t('whatsNew:articles.activity-tracking.content.operation3')}</li>
              <li>{t('whatsNew:articles.activity-tracking.content.operation4')}</li>
              <li>{t('whatsNew:articles.activity-tracking.content.operation5')}</li>
            </ul>

            {/* Screenshot placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Activity timeline view]</p>
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.activity-tracking.content.insightsTitle')}</h2>
            <p className="mb-6">{t('whatsNew:articles.activity-tracking.content.insightsText')}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold mb-2">{t('whatsNew:articles.activity-tracking.content.insight1Title')}</h3>
                <p className="text-sm">{t('whatsNew:articles.activity-tracking.content.insight1Text')}</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold mb-2">{t('whatsNew:articles.activity-tracking.content.insight2Title')}</h3>
                <p className="text-sm">{t('whatsNew:articles.activity-tracking.content.insight2Text')}</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold mb-2">{t('whatsNew:articles.activity-tracking.content.insight3Title')}</h3>
                <p className="text-sm">{t('whatsNew:articles.activity-tracking.content.insight3Text')}</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold mb-2">{t('whatsNew:articles.activity-tracking.content.insight4Title')}</h3>
                <p className="text-sm">{t('whatsNew:articles.activity-tracking.content.insight4Text')}</p>
              </div>
            </div>

            {/* Screenshot placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Performance analytics chart]</p>
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.activity-tracking.content.privacyTitle')}</h2>
            <p>{t('whatsNew:articles.activity-tracking.content.privacyText')}</p>
          </>
        );

      case 'customize-experience':
        return (
          <>
            {/* Hero Image Placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Customization options interface]</p>
            </div>

            <p className="text-lg mb-6">
              {t('whatsNew:articles.customize-experience.content.intro')}
            </p>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.customize-experience.content.customInstructionsTitle')}</h2>
            <p className="mb-4">{t('whatsNew:articles.customize-experience.content.customInstructionsText')}</p>

            <div className="bg-muted rounded-lg p-6 mb-6">
              <pre className="text-sm">
{`# Custom Instructions Example

- Always use TypeScript with strict mode
- Prefer functional components in React
- Add comprehensive error handling
- Include unit tests for critical functions`}
              </pre>
            </div>

            {/* Screenshot placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Server notes editor]</p>
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.customize-experience.content.themesTitle')}</h2>
            <p className="mb-6">{t('whatsNew:articles.customize-experience.content.themesText')}</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-muted rounded-lg p-4 text-center">🌞 Light</div>
              <div className="bg-muted rounded-lg p-4 text-center">🌙 Dark</div>
              <div className="bg-muted rounded-lg p-4 text-center">🌈 System</div>
              <div className="bg-muted rounded-lg p-4 text-center">🎨 Custom</div>
            </div>

            {/* Screenshot placeholder */}
            <div className="bg-muted rounded-lg p-8 mb-8 text-center">
              <p className="text-muted-foreground">[SCREENSHOT: Theme selector]</p>
            </div>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.customize-experience.content.workflowTitle')}</h2>
            <ul className="list-disc list-inside space-y-2 mb-6">
              <li>{t('whatsNew:articles.customize-experience.content.workflow1')}</li>
              <li>{t('whatsNew:articles.customize-experience.content.workflow2')}</li>
              <li>{t('whatsNew:articles.customize-experience.content.workflow3')}</li>
              <li>{t('whatsNew:articles.customize-experience.content.workflow4')}</li>
            </ul>

            <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:articles.customize-experience.content.tipsTitle')}</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>{t('whatsNew:articles.customize-experience.content.tip1')}</li>
              <li>{t('whatsNew:articles.customize-experience.content.tip2')}</li>
              <li>{t('whatsNew:articles.customize-experience.content.tip3')}</li>
            </ol>
          </>
        );

      default:
        return (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Article content coming soon...</p>
          </div>
        );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back Navigation */}
      <Link href="/docs/whats-new" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('whatsNew:backToArticles')}
      </Link>

      {/* Article Header */}
      <motion.div 
        className="mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-4 mb-4">
          <div className={`p-3 rounded-lg ${article.bgColor}`}>
            <Icon className={`w-8 h-8 ${article.color}`} />
          </div>
          <div>
            <Badge variant="outline" className="mb-2">
              {t(`whatsNew:categories.${article.category}`)}
            </Badge>
            <h1 className="text-3xl font-bold">
              {t(`whatsNew:articles.${slug}.title`)}
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {article.readTime} {t('whatsNew:readTime')}
          </span>
        </div>
      </motion.div>

      {/* Article Content */}
      <motion.div 
        className="prose prose-lg dark:prose-invert max-w-none"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {renderArticleContent()}
      </motion.div>

      {/* CTA Section */}
      <motion.div 
        className="mt-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('whatsNew:tryItNow.title')}</CardTitle>
            <CardDescription>
              {t('whatsNew:tryItNow.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button asChild>
                <Link href="/mcp-servers">
                  {t('whatsNew:tryItNow.primaryCta')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/docs/guides">
                  {t('whatsNew:tryItNow.secondaryCta')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Related Articles */}
      <motion.div 
        className="mt-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="text-2xl font-semibold mb-4">{t('whatsNew:relatedArticles')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* This would show 2 related articles */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Coming Soon</CardTitle>
              <CardDescription>More articles will be added here</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Coming Soon</CardTitle>
              <CardDescription>More articles will be added here</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}