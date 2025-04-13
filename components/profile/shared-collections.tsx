import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { SharedCollection } from '@/types/social';

interface SharedCollectionsProps {
  collections: SharedCollection[];
  isLoading?: boolean;
}

export function SharedCollections({ collections, isLoading = false }: SharedCollectionsProps) {
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded w-full mb-2"></div>
              <div className="h-4 bg-muted rounded w-4/5"></div>
            </CardContent>
            <CardFooter>
              <div className="h-10 bg-muted rounded w-28"></div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-lg">No shared collections found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {collections.map((collection) => (
        <Card key={collection.uuid} className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{collection.title}</CardTitle>
            <CardDescription>
              {new Date(collection.created_at).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-sm text-muted-foreground line-clamp-3">
              {collection.description || 'No description provided'}
            </p>
            <div className="mt-2">
              {collection.content && typeof collection.content === 'object' && (
                <div className="rounded-md bg-muted p-2 mt-2">
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(collection.content).length} items in this collection
                  </p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/collections/${collection.uuid}?from=${encodeURIComponent(pathname)}`}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Collection
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
} 