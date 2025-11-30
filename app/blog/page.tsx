import { Metadata } from 'next';
import Link from 'next/link';
import { format } from 'date-fns';
import { Clock, Eye, Calendar, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { getPublishedBlogPosts } from './actions';

export const metadata: Metadata = {
  title: 'Blog | Plugged.in',
  description: 'Latest updates, insights, and announcements from the Plugged.in team',
  openGraph: {
    title: 'Blog | Plugged.in',
    description: 'Latest updates, insights, and announcements from the Plugged.in team',
    type: 'website',
  },
};

export const revalidate = 3600; // Revalidate every hour

export default async function BlogPage() {
  const result = await getPublishedBlogPosts();
  const posts = result.success && result.data ? result.data : [];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-muted/50 to-background py-12 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Blog</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Updates, insights, and announcements from the Plugged.in team
          </p>
        </div>
      </div>

      {/* Blog Posts Grid */}
      <div className="container mx-auto px-4 py-12">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              No blog posts yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => {
              const enTranslation = post.translations.find(t => t.language === 'en');
              if (!enTranslation) return null;

              return (
                <Card key={post.uuid} className="group hover:shadow-lg transition-shadow">
                  <CardHeader>
                    {post.header_image_url && (
                      <div className="mb-4 -mt-6 -mx-6 overflow-hidden rounded-t-lg">
                        <img
                          src={post.header_image_url}
                          alt={post.header_image_alt || enTranslation.title}
                          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">
                        {getCategoryLabel(post.category)}
                      </Badge>
                      {post.is_featured && (
                        <Badge variant="default">Featured</Badge>
                      )}
                    </div>
                    <h2 className="text-2xl font-bold line-clamp-2 group-hover:text-primary transition-colors">
                      {enTranslation.title}
                    </h2>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground line-clamp-3">
                      {enTranslation.excerpt}
                    </p>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground w-full">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {post.published_at
                          ? format(new Date(post.published_at), 'MMM d, yyyy')
                          : 'Draft'}
                      </div>
                      {post.reading_time_minutes && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {post.reading_time_minutes} min
                        </div>
                      )}
                      <div className="flex items-center gap-1 ml-auto">
                        <Eye className="h-4 w-4" />
                        {post.view_count}
                      </div>
                    </div>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="flex items-center gap-2 text-primary hover:gap-3 transition-all font-medium"
                    >
                      Read More
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
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
