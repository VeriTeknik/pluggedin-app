import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { rateServer } from '@/app/actions/mcp-server-metrics';
import { getUserRating } from '@/app/actions/mcp-server-user-rating';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Star } from '@/components/ui/star-rating';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { McpServerSource } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';

interface RateServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverData: {
    name: string;
    source?: McpServerSource;
    external_id?: string;
  };
  onRatingSubmitted?: () => void;
}

export function RateServerDialog({
  open,
  onOpenChange,
  serverData,
  onRatingSubmitted,
}: RateServerDialogProps) {
  const { t: _t } = useTranslation();
  const { currentProfile } = useProfiles();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingRating, setExistingRating] = useState<{ rating?: number; comment?: string; feedbackId?: string } | null>(null);
  const [isCheckingRating, setIsCheckingRating] = useState(true);

  const form = useForm({
    defaultValues: {
      rating: 0,
      comment: '',
    },
  });

  // Check if user has already rated this server
  useEffect(() => {
    const checkExistingRating = async () => {
      if (!open || !currentProfile?.uuid || !serverData.external_id) {
        setIsCheckingRating(false);
        return;
      }

      setIsCheckingRating(true);
      try {
        const userRating = await getUserRating(currentProfile.uuid, serverData.external_id);
        setExistingRating(userRating);
        
        // If user has already rated, populate the form with existing values
        if (userRating) {
          form.setValue('rating', userRating.rating || 0);
          form.setValue('comment', userRating.comment || '');
        }
      } catch (error) {
        console.error('Failed to check existing rating:', error);
      } finally {
        setIsCheckingRating(false);
      }
    };

    checkExistingRating();
  }, [open, currentProfile?.uuid, serverData.external_id, form]);

  const onSubmit = async (values: { rating: number; comment: string }) => {
    console.log('[RateServerDialog] Submit called with:', {
      values,
      serverData,
      profileUuid: currentProfile?.uuid
    });
    
    if (!currentProfile?.uuid) {
      console.error('[RateServerDialog] No current profile');
      return;
    }
    if (!serverData.source || !serverData.external_id) {
      console.error('[RateServerDialog] Missing source or external_id:', serverData);
      return;
    }
    if (values.rating < 1 || values.rating > 5) {
      toast({
        title: 'Error',
        description: 'Please select a rating between 1 and 5 stars',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('[RateServerDialog] Calling rateServer with:', {
        profileUuid: currentProfile.uuid,
        rating: values.rating,
        comment: values.comment,
        externalId: serverData.external_id,
        source: serverData.source
      });
      
      const result = await rateServer(
        currentProfile.uuid,
        values.rating,
        values.comment,
        undefined, // No server UUID for external sources
        serverData.external_id,
        serverData.source
      );
      
      if (result.success) {
        // Analytics tracking removed - will be replaced with new analytics service
        
        toast({
          title: 'Success',
          description: 'Thank you for rating this server!',
        });
        onOpenChange(false);
        form.reset();
        onRatingSubmitted?.();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to submit rating',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error rating server:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existingRating ? 'Update' : 'Rate'} &quot;{serverData.name}&quot;
          </DialogTitle>
          <DialogDescription>
            {existingRating 
              ? 'You have already rated this server. You can update your rating below.'
              : 'Your rating helps other users find quality servers'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='rating'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rating</FormLabel>
                  <FormControl>
                    <div className="flex justify-center p-2">
                      <Star.Group
                        value={field.value}
                        onChange={field.onChange}
                        size="lg"
                      >
                        <Star.Item value={1} />
                        <Star.Item value={2} />
                        <Star.Item value={3} />
                        <Star.Item value={4} />
                        <Star.Item value={5} />
                      </Star.Group>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='comment'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comment (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Share your experience with this server"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='flex justify-end gap-4'>
              <Button
                variant='outline'
                type='button'
                onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting || isCheckingRating}>
                {isCheckingRating 
                  ? 'Checking...' 
                  : isSubmitting 
                    ? 'Submitting...' 
                    : existingRating 
                      ? 'Update Rating' 
                      : 'Submit Rating'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 