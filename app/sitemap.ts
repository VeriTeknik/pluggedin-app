import { and, eq, isNotNull } from 'drizzle-orm';
import { MetadataRoute } from 'next';

import { db } from '@/db';
import { blogPostsTable, BlogPostStatus, users } from '@/db/schema';

// At Next.js build time the database isn't reachable in every environment
// — most importantly inside `pnpm build` running in our docker image, where
// there's no postgres available. If DB lookups fail here the whole build
// aborts. Falling back to "just the static routes" keeps the sitemap valid
// (search engines re-crawl it on a schedule anyway).
async function loadDynamicSitemapEntries() {
  try {
    const blogPosts = await db.query.blogPostsTable.findMany({
      where: eq(blogPostsTable.status, BlogPostStatus.PUBLISHED),
      columns: {
        slug: true,
        updated_at: true,
        published_at: true,
      },
    });
    const publicUsers = await db
      .select({ username: users.username, updated_at: users.updated_at })
      .from(users)
      .where(and(isNotNull(users.username), eq(users.is_public, true)))
      .limit(50_000);
    return { blogPosts, publicUsers };
  } catch (err) {
    console.warn(
      '[sitemap] DB lookup failed (returning only static routes):',
      err instanceof Error ? err.message : err,
    );
    return { blogPosts: [], publicUsers: [] };
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://plugged.in';
  const currentDate = new Date();
  const { blogPosts, publicUsers } = await loadDynamicSitemapEntries();

  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/search?source=REGISTRY&offset=0`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/to`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/setup-guide`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/inspector-guide`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/release-notes`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/legal`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/legal/privacy-policy`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/legal/terms-of-service`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/legal/disclaimer`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/contact`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  // Blog post routes
  const blogRoutes: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.updated_at || post.published_at || currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Public user profile routes
  const userRoutes: MetadataRoute.Sitemap = publicUsers.map((user) => ({
    url: `${baseUrl}/to/${encodeURIComponent(user.username!)}`,
    lastModified: user.updated_at || currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...blogRoutes, ...userRoutes];
}
