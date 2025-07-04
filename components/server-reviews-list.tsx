'use client';

import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Star, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { McpServerSource } from '@/db/schema';
import { FeedbackItem, FeedbackResponse, registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';

interface ServerReviewsListProps {
  serverId: string;
  source?: McpServerSource;
  currentUserId?: string;
}

export function ServerReviewsList({ serverId, source, currentUserId }: ServerReviewsListProps) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<'newest' | 'oldest' | 'rating_high' | 'rating_low'>('newest');
  const limit = 10;

  useEffect(() => {
    loadFeedback();
  }, [serverId, sort]);

  const loadFeedback = async (loadMore = false) => {
    if (!serverId) return;
    
    setIsLoading(!loadMore);
    try {
      const response: FeedbackResponse = await registryVPClient.getFeedback(
        serverId,
        limit,
        loadMore ? offset : 0,
        sort
      );
      
      if (loadMore) {
        setFeedback(prev => [...prev, ...response.feedback]);
      } else {
        setFeedback(response.feedback);
        setOffset(0);
      }
      
      setTotalCount(response.total_count);
      setHasMore(response.has_more);
      setOffset(prev => prev + response.feedback.length);
    } catch (error) {
      console.error('Failed to load feedback:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMore = () => {
    loadFeedback(true);
  };

  const formatRating = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < rating
            ? 'fill-yellow-400 text-yellow-400'
            : 'fill-muted text-muted-foreground'
        }`}
      />
    ));
  };

  if (isLoading && feedback.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (feedback.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('reviews.noReviews', 'No reviews yet')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('reviews.beFirst', 'Be the first to rate and review this server')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with count and sort */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('reviews.showing', 'Showing {{count}} of {{total}} reviews', {
            count: feedback.length,
            total: totalCount,
          })}
        </h3>
        <Select value={sort} onValueChange={(value: any) => setSort(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t('reviews.sort.newest', 'Newest first')}</SelectItem>
            <SelectItem value="oldest">{t('reviews.sort.oldest', 'Oldest first')}</SelectItem>
            <SelectItem value="rating_high">{t('reviews.sort.ratingHigh', 'Highest rated')}</SelectItem>
            <SelectItem value="rating_low">{t('reviews.sort.ratingLow', 'Lowest rated')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reviews list */}
      <div className="space-y-3">
        {feedback.map((item) => (
          <Card key={item.id} className={item.user_id === currentUserId ? 'ring-2 ring-primary' : ''}>
            <CardContent className="p-4">
              <div className="flex gap-4">
                {/* User avatar */}
                <Avatar className="h-10 w-10">
                  <AvatarImage src={item.user_avatar} />
                  <AvatarFallback>
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>

                {/* Review content */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {item.username || t('reviews.anonymous', 'Anonymous')}
                        </span>
                        {item.user_id === currentUserId && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            {t('reviews.you', 'You')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex">{formatRating(item.rating)}</div>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {item.comment && (
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{item.comment}</p>
                  )}

                  {item.updated_at !== item.created_at && (
                    <p className="text-xs text-muted-foreground">
                      {t('reviews.edited', 'Edited {{time}}', {
                        time: formatDistanceToNow(new Date(item.updated_at), { addSuffix: true }),
                      })}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoading}
          >
            {isLoading ? t('reviews.loading', 'Loading...') : t('reviews.loadMore', 'Load more reviews')}
          </Button>
        </div>
      )}
    </div>
  );
}