'use server';

import { db } from '@/db';
import { blogPostsTable, blogPostTranslationsTable, BlogPostStatus, BlogPostCategory } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { Locale } from '@/i18n/config';

/**
 * Get all published blog posts
 */
export async function getPublishedBlogPosts() {
  try {
    const posts = await db.query.blogPostsTable.findMany({
      where: eq(blogPostsTable.status, BlogPostStatus.PUBLISHED),
      with: {
        translations: true,
        author: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(blogPostsTable.published_at)],
    });

    return {
      success: true,
      data: posts,
    };
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return {
      success: false,
      error: 'Failed to fetch blog posts',
    };
  }
}

/**
 * Get featured blog posts
 */
export async function getFeaturedBlogPosts(limit = 3) {
  try {
    const posts = await db.query.blogPostsTable.findMany({
      where: and(
        eq(blogPostsTable.status, BlogPostStatus.PUBLISHED),
        eq(blogPostsTable.is_featured, true)
      ),
      with: {
        translations: true,
        author: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(blogPostsTable.published_at)],
      limit,
    });

    return {
      success: true,
      data: posts,
    };
  } catch (error) {
    console.error('Error fetching featured posts:', error);
    return {
      success: false,
      error: 'Failed to fetch featured posts',
    };
  }
}

/**
 * Get blog post by slug
 */
export async function getBlogPostBySlug(slug: string, language: Locale = 'en') {
  try {
    const post = await db.query.blogPostsTable.findFirst({
      where: and(
        eq(blogPostsTable.slug, slug),
        eq(blogPostsTable.status, BlogPostStatus.PUBLISHED)
      ),
      with: {
        translations: true,
        author: {
          columns: {
            id: true,
            name: true,
            avatar_url: true,
          },
        },
      },
    });

    if (!post) {
      return {
        success: false,
        error: 'Blog post not found',
      };
    }

    // Increment view count
    await db
      .update(blogPostsTable)
      .set({
        view_count: sql`${blogPostsTable.view_count} + 1`,
      })
      .where(eq(blogPostsTable.uuid, post.uuid));

    return {
      success: true,
      data: post,
    };
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return {
      success: false,
      error: 'Failed to fetch blog post',
    };
  }
}

/**
 * Get blog posts by category
 */
export async function getBlogPostsByCategory(category: string) {
  try {
    const posts = await db.query.blogPostsTable.findMany({
      where: and(
        eq(blogPostsTable.status, BlogPostStatus.PUBLISHED),
        eq(blogPostsTable.category, category as BlogPostCategory)
      ),
      with: {
        translations: true,
        author: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(blogPostsTable.published_at)],
    });

    return {
      success: true,
      data: posts,
    };
  } catch (error) {
    console.error('Error fetching posts by category:', error);
    return {
      success: false,
      error: 'Failed to fetch posts',
    };
  }
}
