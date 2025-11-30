import { BlogPostForm } from '../components/blog-post-form';

export const metadata = {
  title: 'Create Blog Post | Admin',
  description: 'Create a new blog post',
};

export default function NewBlogPostPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create New Blog Post</h1>
        <p className="text-muted-foreground mt-2">
          Write and publish a new blog post for plugged.in
        </p>
      </div>

      <BlogPostForm />
    </div>
  );
}
