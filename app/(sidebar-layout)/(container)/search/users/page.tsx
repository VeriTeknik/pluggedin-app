'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { followUser, unfollowUser } from '@/app/actions/social';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

interface User {
  id: string;
  name: string;
  username: string;
  isFollowing: boolean;
}

function SearchUsersContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [query, setQuery] = useState(searchParams.get('q') || '');

  const fetcher = async (url: string): Promise<User[]> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  };

  const { data: users, error, isLoading } = useSWR(
    query.length >= 2 ? `/api/search/users?q=${encodeURIComponent(query)}` : null,
    fetcher
  );

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value.length >= 2) {
      const params = new URLSearchParams(searchParams);
      params.set('q', value);
      router.push(`/search/users?${params.toString()}`);
    }
  };

  const handleFollow = async (userId: string) => {
    try {
      await followUser(userId, userId);
      toast({
        title: t('social.follow.success'),
        description: t('social.follow.successDescription'),
      });
    } catch (error) {
      toast({
        title: t('social.follow.error'),
        description: t('social.follow.errorDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleUnfollow = async (userId: string) => {
    try {
      await unfollowUser(userId, userId);
      toast({
        title: t('social.unfollow.success'),
        description: t('social.unfollow.successDescription'),
      });
    } catch (error) {
      toast({
        title: t('social.unfollow.error'),
        description: t('social.unfollow.errorDescription'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">{t('search.users.title')}</h1>
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t('search.users.searchPlaceholder')}
        />

        {isLoading && <div>{t('common.loading')}</div>}
        {error && <div className="text-red-500">{t('common.error')}</div>}
        {users?.length === 0 && query.length >= 2 && (
          <div>{t('search.users.noResults')}</div>
        )}

        <div className="space-y-4">
          {users?.map((user: User) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div>
                <h3 className="font-medium">{user.name}</h3>
                <p className="text-sm text-gray-500">@{user.username}</p>
              </div>
              <Button
                onClick={() =>
                  user.isFollowing ? handleUnfollow(user.id) : handleFollow(user.id)
                }
                variant={user.isFollowing ? 'outline' : 'default'}
              >
                {user.isFollowing
                  ? t('social.unfollow.button')
                  : t('social.follow.button')}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SearchUsersPage() {
  return (
    <Suspense fallback={<div className="container py-8">Loading...</div>}>
      <SearchUsersContent />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic'; 