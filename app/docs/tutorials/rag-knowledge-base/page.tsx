import type { Metadata } from 'next';

import { RagKnowledgeBasePageClient } from './page-client';

export const metadata: Metadata = {
  title: 'Building a RAG Knowledge Base - Plugged.in Docs',
  description: 'Learn how to build and manage a RAG knowledge base with Plugged.in',
  keywords: ['RAG', 'knowledge base', 'documents', 'vector search', 'AI'],
};

export default function RagKnowledgeBasePage() {
  return <RagKnowledgeBasePageClient />;
}