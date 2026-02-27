import { getFeaturedBlogPosts } from '@/app/blog/actions';

import { LatestBlogPostsClient } from './latest-blog-posts-client';

export async function LatestBlogPostsSection() {
  const result = await getFeaturedBlogPosts(3);

  if (!result.success || !result.data || result.data.length === 0) {
    return null;
  }

  return <LatestBlogPostsClient posts={result.data} />;
}
