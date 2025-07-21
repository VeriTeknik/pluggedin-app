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
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-4 py-3 border-b">
          <DialogTitle className="text-lg">
            {existingRating ? 'Update' : 'Rate'} &quot;{serverData.name}&quot;
          </DialogTitle>
          <DialogDescription className="text-sm">
            {existingRating 
              ? 'You have already rated this server. You can update your rating below.'
              : 'Your rating helps other users find quality servers'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-3'>
              <FormField
                control={form.control}
                name='rating'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Rating</FormLabel>
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
                    <FormLabel className="text-sm">Comment (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Share your experience with this server"
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <div className="flex-shrink-0 border-t px-4 py-3">
          <div className='flex justify-end gap-2'>
            <Button
              variant='outline'
              type='button'
              size="sm"
              onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type='submit' 
              disabled={isSubmitting || isCheckingRating}
              size="sm"
              onClick={form.handleSubmit(onSubmit)}
            >
              {isCheckingRating 
                ? 'Checking...' 
                : isSubmitting 
                  ? 'Submitting...' 
                  : existingRating 
                    ? 'Update Rating' 
                    : 'Submit Rating'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 