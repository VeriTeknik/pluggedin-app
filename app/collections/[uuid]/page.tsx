import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { getSharedCollection } from '@/app/actions/social';
import { getAuthSession } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface CollectionPageProps {
  params: {
    uuid: string;
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { uuid } = params;
  const collection = await getSharedCollection(uuid);

  if (!collection) {
    notFound();
  }

  // Get user session
  const session = await getAuthSession();

  // Safely extract collection items
  let collectionItems: Array<[string, any]> = [];
  if (collection.content && typeof collection.content === 'object') {
    try {
      collectionItems = Object.entries(collection.content);
    } catch (error) {
      console.error('Error parsing collection content:', error);
    }
  }

  return (
    <div className="container py-8 max-w-4xl mx-auto">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={collection.profile?.username ? `/to/${collection.profile.username}` : '/discover'}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to {collection.profile?.name || 'Profile'}
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">{collection.title}</h1>
        {collection.description && (
          <p className="text-muted-foreground mt-2">{collection.description}</p>
        )}
        <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
          <span>Shared by: {collection.profile?.name || 'Unknown'}</span>
          <span>•</span>
          <span>{new Date(collection.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold mb-4">Collection Items</h2>
        
        {collectionItems.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {collectionItems.map(([key, value]) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle>{key}</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-2 rounded-md overflow-auto text-xs">
                    {JSON.stringify(value, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-center text-muted-foreground">
              This collection has no content or it's in an unsupported format.
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 