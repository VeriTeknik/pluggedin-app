import { Metadata } from 'next';

import ApiReferencePageClient from './page-client';

export const metadata: Metadata = {
  title: 'API Reference - Plugged.in',
  description: 'Complete API reference for the MCP Registry API. Learn how to discover, publish, and manage MCP servers programmatically.',
};

export default function ApiReferencePage() {
  return <ApiReferencePageClient />;
} 