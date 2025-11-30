import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { BlogPostsListServer } from './components/blog-posts-list-server';

export const metadata = {
  title: 'Blog Management | Admin',
  description: 'Manage blog posts',
};

export default function AdminBlogPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Blog Management</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage blog posts for plugged.in
          </p>
        </div>
        <Link href="/admin/blog/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Post
          </Button>
        </Link>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <BlogPostsListServer />
      </Suspense>
    </div>
  );
}
