import type { Metadata } from 'next';

import { FirstMCPServerPageClient } from './page-client';

export const metadata: Metadata = {
  title: 'Your First MCP Server - Plugged.in Tutorials',
  description: 'Learn how to add and configure your first MCP server in Plugged.in. Perfect for beginners getting started with the Model Context Protocol.',
  keywords: 'MCP, Model Context Protocol, tutorial, beginner, setup, Plugged.in',
};

export default function FirstMCPServerPage() {
  return <FirstMCPServerPageClient />;
}