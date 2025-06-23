import { Metadata } from 'next';

import DocsPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Documentation - Plugged.in',
  description: 'Learn how to use Plugged.in, integrate MCP servers, and build AI-powered applications.',
};

export default function DocsPage() {
  return <DocsPageClient />;
}