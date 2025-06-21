import { Metadata } from 'next';

import TutorialsPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Tutorials - Plugged.in',
  description: 'Step-by-step tutorials to help you master Plugged.in features - from basic MCP server setup to advanced RAG integration and custom development.',
};

export default function TutorialsPage() {
  return <TutorialsPageClient />;
}