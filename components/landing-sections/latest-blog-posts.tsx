'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock, ArrowRight, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getFeaturedBlogPosts } from '@/app/blog/actions';

interface BlogPost {
  uuid: string;
  slug: string;
  category: string;
  is_featured: boolean;
  header_image_url: string | null;
  header_image_alt: string | null;
  published_at: Date | null;
  reading_time_minutes: number | null;
  view_count: number;
  translations: Array<{
    language: string;
    title: string;
    excerpt: string;
  }>;
}

export function LatestBlogPostsSection() {
  const { t } = useTranslation(['blog', 'common']);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const result = await getFeaturedBlogPosts(3);
        if (result.success && result.data) {
          setPosts(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch blog posts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  if (loading) {
    return (
      <section className="py-16 md:py-24 bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <div className="h-10 w-64 bg-muted rounded mx-auto mb-4 animate-pulse" />
            <div className="h-6 w-96 bg-muted rounded mx-auto animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-muted rounded-lg mb-4" />
                <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-full mb-2" />
                <div className="h-4 bg-muted rounded w-5/6" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="py-16 md:py-24 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('blog:blog.latestPosts')}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Stay updated with the latest news, insights, and updates from the Plugged.in team
          </p>
        </div>

        {/* Blog Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {posts.map((post) => {
            const enTranslation = post.translations.find(t => t.language === 'en');

            return (
              <Link
                key={post.uuid}
                href={`/blog/${post.slug}`}
                className="group block"
              >
                <article className="h-full bg-card border rounded-lg overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                  {/* Post Image */}
                  {post.header_image_url && (
                    <div className="aspect-video overflow-hidden bg-muted">
                      <img
                        src={post.header_image_url}
                        alt={post.header_image_alt || enTranslation?.title || ''}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}

                  {/* Post Content */}
                  <div className="p-6">
                    {/* Category Badge */}
                    <div className="mb-3">
                      <Badge variant="secondary">
                        {t(`blog:blog.categories.${post.category}`)}
                      </Badge>
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-semibold mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                      {enTranslation?.title || 'Untitled'}
                    </h3>

                    {/* Excerpt */}
                    <p className="text-muted-foreground mb-4 line-clamp-3">
                      {enTranslation?.excerpt || ''}
                    </p>

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {post.published_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{format(new Date(post.published_at), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                      {post.reading_time_minutes && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{post.reading_time_minutes} min</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        <span>{post.view_count}</span>
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>

        {/* View All Link */}
        <div className="text-center">
          <Button asChild size="lg" variant="outline">
            <Link href="/blog">
              {t('common:viewAll')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
