import type { Metadata } from 'next';

import { SelfHostingPageClient } from './page-client';

export const metadata: Metadata = {
  title: 'Self-Hosting Plugged.in - Plugged.in Docs',
  description: 'Learn how to self-host Plugged.in for complete control over your MCP infrastructure',
  keywords: ['self-hosting', 'deployment', 'Docker', 'PostgreSQL', 'infrastructure'],
};

export default function SelfHostingPage() {
  return <SelfHostingPageClient />;
}