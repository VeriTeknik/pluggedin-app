'use server';

import { db } from '@/db';
import { blogPostsTable, blogPostTranslationsTable, users } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { revalidatePath } from 'next/cache';

// Validation schemas
const blogPostSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  status: z.enum(['draft', 'published', 'archived']),
  category: z.enum(['announcement', 'technical', 'product', 'tutorial', 'case-study']),
  tags: z.array(z.string()).default([]),
  headerImageUrl: z.string().optional(),
  headerImageAlt: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImageUrl: z.string().optional(),
  readingTimeMinutes: z.number().optional(),
  isFeatured: z.boolean().default(false),
});

const blogTranslationSchema = z.object({
  language: z.enum(['en', 'tr', 'zh', 'ja', 'hi', 'nl']),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  content: z.string().min(1),
});

const createBlogPostSchema = z.object({
  post: blogPostSchema,
  translations: z.array(blogTranslationSchema).min(1),
});

const updateBlogPostSchema = z.object({
  uuid: z.string().uuid(),
  post: blogPostSchema.partial(),
  translations: z.array(blogTranslationSchema.extend({
    uuid: z.string().uuid().optional(),
  })).optional(),
});

// Helper function to check admin access
async function checkAdminAccess() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, session.user.email),
  });

  if (!user?.is_admin) {
    throw new Error('Admin access required');
  }

  return user;
}

// Helper function to calculate reading time
function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const words = content.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

/**
 * Create a new blog post with translations
 */
export async function createBlogPost(data: z.infer<typeof createBlogPostSchema>) {
  try {
    const user = await checkAdminAccess();
    const validated = createBlogPostSchema.parse(data);

    // Check if slug already exists
    const existingPost = await db.query.blogPostsTable.findFirst({
      where: eq(blogPostsTable.slug, validated.post.slug),
    });

    if (existingPost) {
      return {
        success: false,
        error: 'A blog post with this slug already exists',
      };
    }

    // Create blog post
    const [blogPost] = await db
      .insert(blogPostsTable)
      .values({
        author_id: user.id,
        slug: validated.post.slug,
        status: validated.post.status,
        category: validated.post.category,
        tags: validated.post.tags,
        header_image_url: validated.post.headerImageUrl,
        header_image_alt: validated.post.headerImageAlt,
        meta_title: validated.post.metaTitle,
        meta_description: validated.post.metaDescription,
        og_image_url: validated.post.ogImageUrl,
        reading_time_minutes: validated.post.readingTimeMinutes,
        is_featured: validated.post.isFeatured,
        published_at: validated.post.status === 'published' ? new Date() : null,
      })
      .returning();

    // Calculate reading time from English translation (or first translation)
    const primaryTranslation = validated.translations.find(t => t.language === 'en') || validated.translations[0];
    const readingTime = primaryTranslation ? calculateReadingTime(primaryTranslation.content) : null;

    // Update reading time if calculated
    if (readingTime) {
      await db
        .update(blogPostsTable)
        .set({ reading_time_minutes: readingTime })
        .where(eq(blogPostsTable.uuid, blogPost.uuid));
    }

    // Create translations
    for (const translation of validated.translations) {
      await db.insert(blogPostTranslationsTable).values({
        blog_post_uuid: blogPost.uuid,
        language: translation.language,
        title: translation.title,
        excerpt: translation.excerpt,
        content: translation.content,
      });
    }

    revalidatePath('/blog');
    revalidatePath('/admin/blog');

    return {
      success: true,
      data: { uuid: blogPost.uuid },
    };
  } catch (error) {
    console.error('Error creating blog post:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create blog post',
    };
  }
}

/**
 * Update an existing blog post
 */
export async function updateBlogPost(data: z.infer<typeof updateBlogPostSchema>) {
  try {
    await checkAdminAccess();
    const validated = updateBlogPostSchema.parse(data);

    // Check if blog post exists
    const existingPost = await db.query.blogPostsTable.findFirst({
      where: eq(blogPostsTable.uuid, validated.uuid),
    });

    if (!existingPost) {
      return {
        success: false,
        error: 'Blog post not found',
      };
    }

    // Check slug uniqueness if changed
    if (validated.post.slug && validated.post.slug !== existingPost.slug) {
      const slugExists = await db.query.blogPostsTable.findFirst({
        where: eq(blogPostsTable.slug, validated.post.slug),
      });

      if (slugExists) {
        return {
          success: false,
          error: 'A blog post with this slug already exists',
        };
      }
    }

    // Update blog post - map camelCase to snake_case
    const updateData: any = {
      slug: validated.post.slug,
      status: validated.post.status,
      category: validated.post.category,
      updated_at: new Date(),
    };

    // Only include optional fields if they're defined
    if (validated.post.tags !== undefined) updateData.tags = validated.post.tags;
    if (validated.post.headerImageUrl !== undefined) updateData.header_image_url = validated.post.headerImageUrl;
    if (validated.post.headerImageAlt !== undefined) updateData.header_image_alt = validated.post.headerImageAlt;
    if (validated.post.metaTitle !== undefined) updateData.meta_title = validated.post.metaTitle;
    if (validated.post.metaDescription !== undefined) updateData.meta_description = validated.post.metaDescription;
    if (validated.post.ogImageUrl !== undefined) updateData.og_image_url = validated.post.ogImageUrl;
    if (validated.post.readingTimeMinutes !== undefined) updateData.reading_time_minutes = validated.post.readingTimeMinutes;
    if (validated.post.isFeatured !== undefined) updateData.is_featured = validated.post.isFeatured;

    // Set published_at when publishing for the first time
    if (validated.post.status === 'published' && !existingPost.published_at) {
      updateData.published_at = new Date();
    }

    // Clear published_at when unpublishing
    if (validated.post.status === 'draft' && existingPost.published_at) {
      updateData.published_at = null;
    }

    await db
      .update(blogPostsTable)
      .set(updateData)
      .where(eq(blogPostsTable.uuid, validated.uuid));

    // Update translations if provided
    if (validated.translations) {
      // Calculate reading time from English translation (or first translation) once
      const primaryTranslation = validated.translations.find(t => t.language === 'en') || validated.translations[0];
      const readingTime = primaryTranslation ? calculateReadingTime(primaryTranslation.content) : null;

      for (const translation of validated.translations) {
        if (translation.uuid) {
          // Update existing translation
          await db
            .update(blogPostTranslationsTable)
            .set({
              title: translation.title,
              excerpt: translation.excerpt,
              content: translation.content,
              updated_at: new Date(),
            })
            .where(eq(blogPostTranslationsTable.uuid, translation.uuid));
        } else {
          // Create new translation
          await db.insert(blogPostTranslationsTable).values({
            blog_post_uuid: validated.uuid,
            language: translation.language,
            title: translation.title,
            excerpt: translation.excerpt,
            content: translation.content,
          });
        }
      }

      // Update reading time once after all translations
      if (readingTime) {
        await db
          .update(blogPostsTable)
          .set({ reading_time_minutes: readingTime })
          .where(eq(blogPostsTable.uuid, validated.uuid));
      }
    }

    revalidatePath('/blog');
    revalidatePath(`/blog/${validated.post.slug || existingPost.slug}`);
    revalidatePath('/admin/blog');

    return {
      success: true,
      data: { uuid: validated.uuid },
    };
  } catch (error) {
    console.error('Error updating blog post:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update blog post',
    };
  }
}

/**
 * Delete a blog post
 */
export async function deleteBlogPost(uuid: string) {
  try {
    await checkAdminAccess();

    const blogPost = await db.query.blogPostsTable.findFirst({
      where: eq(blogPostsTable.uuid, uuid),
    });

    if (!blogPost) {
      return {
        success: false,
        error: 'Blog post not found',
      };
    }

    // Delete image file if exists
    if (blogPost.header_image_url) {
      try {
        // Strip leading slash to avoid path resolution issues
        const relPath = blogPost.header_image_url.replace(/^\//, '');
        const imagePath = join(process.cwd(), 'public', relPath);
        await unlink(imagePath);
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }

    // Delete blog post (cascade will delete translations)
    await db.delete(blogPostsTable).where(eq(blogPostsTable.uuid, uuid));

    revalidatePath('/blog');
    revalidatePath('/admin/blog');

    return {
      success: true,
    };
  } catch (error) {
    console.error('Error deleting blog post:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete blog post',
    };
  }
}

/**
 * Upload blog header image
 */
export async function uploadBlogImage(formData: FormData) {
  try {
    await checkAdminAccess();

    const file = formData.get('file') as File;
    if (!file) {
      return {
        success: false,
        error: 'No file provided',
      };
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: 'Image must be less than 5MB',
      };
    }

    // Validate file type (MIME type)
    if (!file.type.startsWith('image/')) {
      return {
        success: false,
        error: 'File must be an image',
      };
    }

    // Validate file extension (security: prevent malicious file uploads)
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!extension || !allowedExtensions.includes(extension)) {
      return {
        success: false,
        error: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`,
      };
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `blog-${timestamp}.${extension}`;

    // Ensure blog-images directory exists
    const blogImagesDir = join(process.cwd(), 'public', 'blog-images');
    await mkdir(blogImagesDir, { recursive: true });

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const path = join(blogImagesDir, filename);
    await writeFile(path, buffer);

    const imageUrl = `/blog-images/${filename}`;

    return {
      success: true,
      data: { imageUrl },
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload image',
    };
  }
}

/**
 * Get all blog posts (admin view)
 */
export async function getAllBlogPosts() {
  try {
    await checkAdminAccess();

    const posts = await db.query.blogPostsTable.findMany({
      with: {
        author: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        translations: true,
      },
      orderBy: [desc(blogPostsTable.created_at)],
    });

    return {
      success: true,
      data: posts,
    };
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch blog posts',
    };
  }
}

/**
 * Get single blog post by UUID (admin view)
 */
export async function getBlogPostByUuid(uuid: string) {
  try {
    await checkAdminAccess();

    const post = await db.query.blogPostsTable.findFirst({
      where: eq(blogPostsTable.uuid, uuid),
      with: {
        author: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        translations: true,
      },
    });

    if (!post) {
      return {
        success: false,
        error: 'Blog post not found',
      };
    }

    return {
      success: true,
      data: post,
    };
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch blog post',
    };
  }
}
