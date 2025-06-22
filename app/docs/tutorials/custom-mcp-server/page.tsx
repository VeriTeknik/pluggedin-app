import type { Metadata } from 'next';

import { CustomMcpServerPageClient } from './page-client';

export const metadata: Metadata = {
  title: 'Developing Custom MCP Servers - Plugged.in Docs',
  description: 'Learn how to develop and deploy your own custom MCP servers',
  keywords: ['MCP', 'custom server', 'development', 'TypeScript', 'Python'],
};

export default function CustomMcpServerPage() {
  return <CustomMcpServerPageClient />;
}