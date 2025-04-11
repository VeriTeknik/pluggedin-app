import Link from 'next/link';

export default function ProfileNotFound() {
  return (
    <div className="container mx-auto py-16 text-center">
      <h1 className="text-4xl font-bold mb-4">Profile Not Found</h1>
      <p className="text-muted-foreground mb-8">
        The user profile you're looking for doesn't exist or isn't public.
      </p>
      <Link
        href="/"
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md inline-block"
      >
        Go Home
      </Link>
    </div>
  );
} 