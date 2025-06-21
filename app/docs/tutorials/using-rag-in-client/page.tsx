import { Metadata } from 'next';

import UsingRAGInClientPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Using RAG in Your MCP Client - Plugged.in Tutorial',
  description: 'Learn how to query your RAG knowledge base directly from Claude, Cursor, or any MCP client using the pluggedin_rag_query tool.',
};

export default function UsingRAGInClientPage() {
  return <UsingRAGInClientPageClient />;
}