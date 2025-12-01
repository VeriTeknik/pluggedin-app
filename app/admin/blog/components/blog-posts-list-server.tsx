import { getAllBlogPosts } from '../actions';
import { BlogPostsListClient } from './blog-posts-list-client';

export async function BlogPostsListServer() {
  const result = await getAllBlogPosts();

  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {result.error || 'Failed to load blog posts'}
        </p>
      </div>
    );
  }

  return <BlogPostsListClient posts={result.data as any} />;
}
