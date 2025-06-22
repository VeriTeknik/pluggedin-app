import type { Metadata } from 'next';

import { ApiIntegrationPageClient } from './page-client';

export const metadata: Metadata = {
  title: 'API Integration - Plugged.in Docs',
  description: 'Learn how to integrate with the Plugged.in API for programmatic access',
  keywords: ['API', 'integration', 'REST', 'authentication', 'automation'],
};

export default function ApiIntegrationPage() {
  return <ApiIntegrationPageClient />;
}