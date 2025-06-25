import { Metadata } from 'next';

import WhatsNewPageClient from './page-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "What's New - Plugged.in",
  description: 'Discover the latest features and updates in Plugged.in. Learn how to use new capabilities with practical guides and tutorials.',
};

export default function WhatsNewPage() {
  return <WhatsNewPageClient />;
}