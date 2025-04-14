import { Database, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { SharedCollection } from '@/types/social';

interface CollectionCardGridProps {
  collections: SharedCollection[];
  onSelectionChange?: (selectedIds: string[]) => void;
  selectedIds?: string[];
}

export function CollectionCardGrid({ 
  collections,
  onSelectionChange,
  selectedIds = []
}: CollectionCardGridProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));

  const handleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
    onSelectionChange?.(Array.from(newSelected));
  };

  // Helper to format dates
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
      {collections.map((collection) => (
        <Card key={collection.uuid} className='flex flex-col relative'>
          <div className="absolute right-4 top-4">
            <Checkbox
              checked={selected.has(collection.uuid)}
              onCheckedChange={() => handleSelect(collection.uuid)}
            />
          </div>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <CardTitle className="mr-2">{collection.title}</CardTitle>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                Community
              </Badge>
            </div>
            <CardDescription>{collection.description}</CardDescription>
          </CardHeader>
          <CardContent className='flex-grow pb-2'>
            <div className="text-xs text-muted-foreground mt-2">
              <div className="flex items-center mt-1">
                <Users className="h-3 w-3 mr-1" />
                Shared by:{' '}
                {collection.profile?.project?.user?.username ? (
                  <Link 
                    href={`/to/${collection.profile.project.user.username}`}
                    className="hover:underline ml-1"
                  >
                    {collection.profile.project.user.name}
                  </Link>
                ) : (
                  <span className="ml-1">Unknown</span>
                )}
              </div>
              <div className="flex items-center mt-1">
                <Database className="h-3 w-3 mr-1" />
                Created: {formatDate(collection.created_at.toISOString())}
              </div>
            </div>
          </CardContent>
          <CardFooter className='flex justify-between pt-2'>
            <Button
              variant='default'
              size="sm"
              asChild
            >
              <Link href={`/collections/${collection.uuid}?from=${encodeURIComponent(pathname)}`}>
                View Details
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
} 