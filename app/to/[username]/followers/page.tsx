import { ArrowLeft } from 'lucide-react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { 
  getFollowers,
  getUserByUsername } from '@/app/actions/social';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getAuthSession } from '@/lib/auth';

interface FollowersPageProps {
  params: Promise<{
    username: string;
  }>;
}

export async function generateMetadata({
  params,
}: FollowersPageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getUserByUsername(username);

  if (!profile) {
    return {
      title: 'Profile Not Found',
    };
  }

  return {
    title: `Followers of ${profile.name || profile.username} (@${username}) - Plugged.in`,
    description: `People who follow ${profile.name || profile.username} on Plugged.in`,
  };
}

export default async function FollowersPage({ params }: FollowersPageProps) {
  const { username } = await params;
  const profile = await getUserByUsername(username);

  if (!profile) {
    notFound();
  }

  // Get the current user session
  const session = await getAuthSession();
  
  // If the profile is not public and the user is not signed in, show not found
  if (!profile.is_public && !session?.user) {
    notFound();
  }

  // Get followers
  const followers = await getFollowers(profile.id);

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <div className="mb-6 flex items-center gap-2">
        <Link href={`/to/${username}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to profile
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Followers of @{username}</h1>
      </div>
      
      {followers.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">No followers yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {followers.map((follower) => (
            <div 
              key={follower.id} 
              className="flex items-center justify-between p-4 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {follower.avatar_url && (
                    <AvatarImage src={follower.avatar_url} alt={follower.name || follower.username || ''} />
                  )}
                  <AvatarFallback>
                    {(follower.name?.[0] || follower.username?.[0] || '?').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium">{follower.name || follower.username}</h3>
                  {follower.username && (
                    <Link 
                      href={`/to/${follower.username}`}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      @{follower.username}
                    </Link>
                  )}
                </div>
              </div>
              
              {follower.username && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/to/${follower.username}`}>
                    View Profile
                  </Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 