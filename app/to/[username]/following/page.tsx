import { ArrowLeft } from 'lucide-react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { 
  getFollowing,
  getUserByUsername } from '@/app/actions/social';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getAuthSession } from '@/lib/auth';

interface FollowingPageProps {
  params: Promise<{
    username: string;
  }>;
}

// Force dynamic rendering for this page since it uses headers() via getAuthSession()
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: FollowingPageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getUserByUsername(username);

  if (!profile) {
    return {
      title: 'Profile Not Found',
    };
  }

  return {
    title: `Profiles ${profile.name || profile.username} (@${username}) follows - Plugged.in`,
    description: `People that ${profile.name || profile.username} follows on Plugged.in`,
  };
}

export default async function FollowingPage({ params }: FollowingPageProps) {
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

  // Get following
  const following = await getFollowing(profile.id);

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <div className="mb-6 flex items-center gap-2">
        <Link href={`/to/${username}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to profile
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">@{username} is following</h1>
      </div>
      
      {following.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">Not following anyone yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {following.map((followedProfile) => (
            <div 
              key={followedProfile.id} 
              className="flex items-center justify-between p-4 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {followedProfile.avatar_url && (
                    <AvatarImage src={followedProfile.avatar_url} alt={followedProfile.name || followedProfile.username || ''} />
                  )}
                  <AvatarFallback>
                    {(followedProfile.name?.[0] || followedProfile.username?.[0] || '?').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium">{followedProfile.name || followedProfile.username}</h3>
                  {followedProfile.username && (
                    <Link 
                      href={`/to/${followedProfile.username}`}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      @{followedProfile.username}
                    </Link>
                  )}
                </div>
              </div>
              
              {followedProfile.username && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/to/${followedProfile.username}`}>
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
