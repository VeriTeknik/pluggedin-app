import type { Metadata } from 'next';

import { SharingWithCommunityPageClient } from './page-client';

export const metadata: Metadata = {
  title: 'Sharing with Community - Plugged.in Docs',
  description: 'Learn how to share your MCP servers and collections with the Plugged.in community',
  keywords: ['MCP', 'sharing', 'community', 'collections', 'collaboration'],
};

export default function SharingWithCommunityPage() {
  return <SharingWithCommunityPageClient />;
}