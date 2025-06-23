import { Metadata } from 'next';

import GettingStartedPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Getting Started - Plugged.in',
  description: 'Get started with Plugged.in in 5 minutes. Learn how to set up MCP servers, configure clients, and start building AI-powered applications.',
};

export default function GettingStartedPage() {
  return <GettingStartedPageClient />;
}