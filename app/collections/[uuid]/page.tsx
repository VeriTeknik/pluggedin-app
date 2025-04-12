import { notFound } from 'next/navigation';

import { getSharedCollection } from '@/app/actions/social';
import { getAuthSession } from '@/lib/auth';
import { McpServer } from '@/types/mcp-server';

import { CollectionContent } from './collection-content';

interface CollectionPageProps {
  params: Promise<{
    uuid: string;
  }>;
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { uuid } = await params;
  const session = await getAuthSession();
  const collection = await getSharedCollection(uuid);

  if (!collection) {
    return notFound();
  }

  // Convert collection.content.servers to McpServer[] format
  const items = collection.content?.servers?.map((server: McpServer) => ({
    ...server,
    profile_username: collection.profile?.project?.user?.name || 'Unknown'
  })) || [];

  return (
    <CollectionContent 
      items={items} 
      title={collection.title || 'Untitled Collection'} 
      description={collection.description || undefined}
    />
  );
} 