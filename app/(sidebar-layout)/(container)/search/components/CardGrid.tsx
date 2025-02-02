import { Github } from 'lucide-react';
import Link from 'next/link';

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
import type { SearchIndex } from '@/types/search';

export default function CardGrid({ items }: { items: SearchIndex }) {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
      {Object.entries(items).map(([key, item]) => (
        <Card key={key} className='flex flex-col'>
          <CardHeader>
            <CardTitle>{item.name}</CardTitle>
            <CardDescription>{item.description}</CardDescription>
          </CardHeader>
          <CardContent className='flex-grow'>
            <p className='text-sm text-muted-foreground mb-2'>
              Package: {item.package_name}
            </p>
            <p className='text-sm text-muted-foreground mb-2'>
              Command: {item.command}
            </p>
            {item.args && (
              <p className='text-sm text-muted-foreground mb-2'>
                Example Args: {item.args.join(' ')}
              </p>
            )}
            {item.envs.length > 0 && (
              <div className='flex flex-wrap gap-2 mt-2'>
                {item.envs.map((env) => (
                  <Badge key={env} variant='secondary'>
                    {env}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter className='flex justify-between'>
            {item.githubUrl && (
              <Button variant='outline' asChild>
                <Link
                  href={item.githubUrl}
                  target='_blank'
                  rel='noopener noreferrer'>
                  <Github className='w-4 h-4 mr-2' />
                  GitHub
                </Link>
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
