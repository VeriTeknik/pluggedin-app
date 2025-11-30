import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { Clock, Eye, Calendar, ArrowLeft, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BlogContent } from './blog-content';
import { getBlogPostBySlug } from '../actions';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getBlogPostBySlug(slug);

  if (!result.success || !result.data) {
    return {
      title: 'Post Not Found',
    };
  }

  const post = result.data;
  const enTranslation = post.translations.find(t => t.language === 'en');

  return {
    title: post.meta_title || enTranslation?.title || 'Blog Post',
    description: post.meta_description || enTranslation?.excerpt || '',
    openGraph: {
      title: post.meta_title || enTranslation?.title || '',
      description: post.meta_description || enTranslation?.excerpt || '',
      type: 'article',
      publishedTime: post.published_at ? new Date(post.published_at).toISOString() : undefined,
      authors: [post.author.name || 'Plugged.in Team'],
      images: post.og_image_url || post.header_image_url ? [
        {
          url: post.og_image_url || post.header_image_url || '',
          alt: post.header_image_alt || enTranslation?.title || '',
        },
      ] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.meta_title || enTranslation?.title || '',
      description: post.meta_description || enTranslation?.excerpt || '',
      images: post.og_image_url || post.header_image_url ? [post.og_image_url || post.header_image_url || ''] : [],
    },
  };
}

export const revalidate = 3600; // Revalidate every hour

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const result = await getBlogPostBySlug(slug);

  if (!result.success || !result.data) {
    notFound();
  }

  const post = result.data;
  const enTranslation = post.translations.find(t => t.language === 'en');

  if (!enTranslation) {
    notFound();
  }

  return (
    <article>
      {/* Header */}
      <div className="bg-gradient-to-b from-muted/50 to-background py-8 md:py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <Link href="/blog">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blog
            </Button>
          </Link>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="secondary">
              {getCategoryLabel(post.category)}
            </Badge>
            {post.is_featured && (
              <Badge variant="default">Featured</Badge>
            )}
            {post.tags.map(tag => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            {enTranslation.title}
          </h1>

          <p className="text-xl text-muted-foreground mb-6">
            {enTranslation.excerpt}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{post.author.name || 'Plugged.in Team'}</span>
            </div>
            {post.published_at && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(post.published_at), 'MMMM d, yyyy')}</span>
              </div>
            )}
            {post.reading_time_minutes && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{post.reading_time_minutes} min read</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>{post.view_count} views</span>
            </div>
          </div>
        </div>
      </div>

      {/* Header Image */}
      {post.header_image_url && (
        <div className="container mx-auto px-4 max-w-4xl py-8">
          <img
            src={post.header_image_url}
            alt={post.header_image_alt || enTranslation.title}
            className="w-full rounded-lg shadow-lg"
          />
        </div>
      )}

      {/* Content */}
      <BlogContent post={post} />

      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: enTranslation.title,
            description: enTranslation.excerpt,
            image: post.header_image_url || post.og_image_url || '',
            datePublished: post.published_at ? new Date(post.published_at).toISOString() : '',
            dateModified: post.updated_at ? new Date(post.updated_at).toISOString() : '',
            author: {
              '@type': 'Person',
              name: post.author.name || 'Plugged.in Team',
            },
            publisher: {
              '@type': 'Organization',
              name: 'Plugged.in',
              logo: {
                '@type': 'ImageObject',
                url: 'https://plugged.in/logo.png',
              },
            },
          }),
        }}
      />
    </article>
  );
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    announcement: 'Announcement',
    technical: 'Technical',
    product: 'Product',
    tutorial: 'Tutorial',
    'case-study': 'Case Study',
  };
  return labels[category] || category;
}
