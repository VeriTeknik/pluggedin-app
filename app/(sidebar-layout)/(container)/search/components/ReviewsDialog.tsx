'use client';

import { formatDistanceToNow } from 'date-fns';
import { Star, User } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getReviewsForServer } from '@/app/actions/reviews'; // Assuming this action exists
// Removed unused Badge import
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { McpServerSource } from '@/db/schema';
import { ServerReview } from '@/types/review'; // Assuming this type exists

interface ReviewsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverData: {
    name: string;
    source?: McpServerSource;
    external_id?: string;
  } | null;
}

export function ReviewsDialog({ open, onOpenChange, serverData }: ReviewsDialogProps) {
  const [reviews, setReviews] = useState<ServerReview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReviews() {
      if (!open || !serverData?.source || !serverData?.external_id) {
        setReviews([]);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const fetchedReviews = await getReviewsForServer(
          serverData.source,
          serverData.external_id
        );
        setReviews(fetchedReviews);
      } catch (err) {
        console.error('Failed to fetch reviews:', err);
        setError('Failed to load reviews. Please try again later.');
        setReviews([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchReviews();
  }, [open, serverData]);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
        }`}
      />
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reviews for {serverData?.name}</DialogTitle>
          <DialogDescription>
            See what others are saying about this server.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-6 pr-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2 border-b pb-4 last:border-b-0">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                   </div>
                   <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))
          ) : error ? (
            <p className="text-destructive text-center">{error}</p>
          ) : reviews.length > 0 ? (
            reviews.map((review) => (
              <div key={review.uuid} className="space-y-2 border-b pb-4 last:border-b-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={review.user?.avatar_url || review.user?.image || ''} />
                      <AvatarFallback>
                        {review.user?.name?.[0] || review.user?.username?.[0] || <User className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">
                      {review.user?.name || review.user?.username || 'Anonymous'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {renderStars(review.rating)}
                </div>
                <p className="text-sm text-muted-foreground">{review.comment}</p>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground">No reviews yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
