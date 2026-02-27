import { notFound } from 'next/navigation';

import { getBlogPostByUuid } from '../../actions';
import { BlogPostForm } from '../../components/blog-post-form';

export const metadata = {
  title: 'Edit Blog Post | Admin',
  description: 'Edit blog post',
};

export default async function EditBlogPostPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const result = await getBlogPostByUuid(uuid);

  if (!result.success || !result.data) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Edit Blog Post</h1>
        <p className="text-muted-foreground mt-2">
          Make changes to your blog post
        </p>
      </div>

      <BlogPostForm post={result.data} isEdit />
    </div>
  );
}
