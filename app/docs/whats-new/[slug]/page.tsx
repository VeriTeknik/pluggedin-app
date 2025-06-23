import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import WhatsNewArticleClient from './page-client';

const articles = [
  'send-notifications-from-ai',
  'document-context-rag',
  'encryption-security',
  'lightning-fast-startup',
  'public-profile',
  'import-export-setup',
  'multilingual-support',
  'discover-capabilities',
  'share-collections',
  'activity-tracking',
  'customize-experience',
];

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return articles.map((slug) => ({
    slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  
  if (!articles.includes(slug)) {
    return {
      title: 'Article Not Found',
    };
  }

  // This would normally come from translations
  const titles: Record<string, string> = {
    'send-notifications-from-ai': 'Send Notifications from Any AI Model',
    'document-context-rag': 'Build AI Apps with Document Context',
    'encryption-security': 'Your MCP Servers Are Now Encrypted',
    'lightning-fast-startup': 'Lightning-Fast MCP Server Startup',
    'public-profile': 'Your Public Profile Page',
    'import-export-setup': 'Import & Export Your Setup',
    'multilingual-support': 'Speak Your Language',
    'discover-capabilities': 'Discover Server Capabilities',
    'share-collections': 'Share Your MCP Server Collections',
    'activity-tracking': 'Real-time Activity Tracking',
    'customize-experience': 'Customize Your MCP Experience',
  };

  return {
    title: `${titles[slug]} - What's New | Plugged.in`,
    description: `Learn about ${titles[slug]} in Plugged.in`,
  };
}

export default async function WhatsNewArticlePage({ params }: Props) {
  const { slug } = await params;
  
  if (!articles.includes(slug)) {
    notFound();
  }

  return <WhatsNewArticleClient slug={slug} />;
}