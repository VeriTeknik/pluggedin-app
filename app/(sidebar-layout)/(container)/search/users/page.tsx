'use client';

import { UserSearch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { followProfile, isFollowing } from '@/app/actions/social';
import { Avatar, AvatarFallback,AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useProfiles } from '@/hooks/use-profiles';
import { Profile } from '@/types/profile';

export default function SearchUsersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentProfile } = useProfiles();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [followingStatus, setFollowingStatus] = useState<Record<string, boolean>>({});

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/search/users?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error('Failed to search users');
      
      const results = await response.json();
      setSearchResults(results);
      
      // Check following status for each profile
      if (currentProfile) {
        const followStatusMap: Record<string, boolean> = {};
        for (const profile of results) {
          const following = await isFollowing(currentProfile.uuid, profile.uuid);
          followStatusMap[profile.uuid] = following;
        }
        setFollowingStatus(followStatusMap);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to search for users',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleFollow = async (profileUuid: string) => {
    if (!currentProfile) {
      toast({
        title: 'Error',
        description: 'You need to be logged in to follow users',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await followProfile(currentProfile.uuid, profileUuid);
      if (result.success) {
        setFollowingStatus(prev => ({
          ...prev,
          [profileUuid]: true
        }));
        toast({
          title: 'Success',
          description: 'User followed successfully',
        });
      } else {
        throw new Error(result.error || 'Failed to follow user');
      }
    } catch (error) {
      console.error('Error following user:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleVisitProfile = (username: string) => {
    router.push(`/to/${username}`);
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-2">Find People to Follow</h1>
      <p className="text-muted-foreground mb-8">
        Search for users by name or username and follow them to see their shared content
      </p>
      
      <div className="flex gap-2 mb-8">
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="max-w-md"
        />
        <Button onClick={handleSearch} disabled={isSearching}>
          {isSearching ? 'Searching...' : 'Search'}
        </Button>
      </div>
      
      {isSearching ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-24" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : searchResults.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {searchResults.map((profile) => (
            <Card key={profile.uuid}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={profile.avatar_url || ''} alt={profile.name || 'User'} />
                    <AvatarFallback>{(profile.name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg">{profile.name}</CardTitle>
                    {profile.username && (
                      <p className="text-sm text-muted-foreground">@{profile.username}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm line-clamp-2">
                  {profile.bio || 'No bio provided'}
                </p>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button
                  variant={followingStatus[profile.uuid] ? "outline" : "default"}
                  onClick={() => !followingStatus[profile.uuid] && handleFollow(profile.uuid)}
                  disabled={followingStatus[profile.uuid]}
                  size="sm"
                >
                  {followingStatus[profile.uuid] ? 'Following' : 'Follow'}
                </Button>
                {profile.username && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleVisitProfile(profile.username!)}
                  >
                    Visit Profile
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : searchQuery.trim() !== '' ? (
        <div className="text-center py-12">
          <UserSearch className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold mt-4 mb-2">No users found</h2>
          <p className="text-muted-foreground">
            Try a different search term or check your spelling
          </p>
        </div>
      ) : (
        <div className="text-center py-12">
          <UserSearch className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold mt-4 mb-2">Search for users</h2>
          <p className="text-muted-foreground">
            Enter a name or username to find people to follow
          </p>
        </div>
      )}
    </div>
  );
} 