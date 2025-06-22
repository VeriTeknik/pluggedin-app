import type { Metadata } from 'next';

import { SecurityBestPracticesPageClient } from './page-client';

export const metadata: Metadata = {
  title: 'Security Best Practices - Plugged.in Docs',
  description: 'Learn security best practices for configuring and using Plugged.in safely',
  keywords: ['security', 'best practices', 'authentication', 'encryption', 'safety'],
};

export default function SecurityBestPracticesPage() {
  return <SecurityBestPracticesPageClient />;
}