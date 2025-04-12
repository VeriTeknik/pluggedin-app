import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { rateServer } from '@/app/actions/mcp-server-metrics';
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

  const form = useForm({
    defaultValues: {
      rating: 0,
      comment: '',
    },
  });

  const onSubmit = async (values: { rating: number; comment: string }) => {
    if (!currentProfile?.uuid) {
      return;
    }
    if (!serverData.source || !serverData.external_id) {
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
          <DialogTitle>Rate &quot;{serverData.name}&quot;</DialogTitle>
          <DialogDescription>
            Your rating helps other users find quality servers
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
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Rating'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 