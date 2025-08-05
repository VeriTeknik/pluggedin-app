'use client';

import { Bot, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { updateUserSocial } from '@/app/actions/social';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { users } from '@/db/schema';
import { useToast } from '@/hooks/use-toast';

type User = typeof users.$inferSelect;

interface AIAssistantsSectionProps {
  user: User;
}

export function AIAssistantsSection({ user }: AIAssistantsSectionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [description, setDescription] = useState(user?.ai_assistants_description || 'My lovely AI assistants are here. Just select an assistant and connect to me. You can schedule meetings or ask me questions here.');
  const [isUpdating, setIsUpdating] = useState(false);

  if (!user) {
    return null;
  }

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      const result = await updateUserSocial(user.id, { 
        ai_assistants_description: description.trim() 
      });
      
      if (result.success) {
        toast({
          title: 'Success',
          description: 'AI Assistants description updated successfully',
        });
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to update description');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update description',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const hasChanges = description.trim() !== (user?.ai_assistants_description || '').trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Assistants
          <Sparkles className="h-4 w-4 text-yellow-500" />
        </CardTitle>
        <CardDescription>
          Add a general description about your AI assistants that will be displayed on your profile
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ai-description">
            Public Description
          </Label>
          <Textarea
            id="ai-description"
            placeholder="Tell visitors about your AI assistants - what they do, how they can help, their specialties..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            This description will appear at the top of the AI Assistants tab on your public profile
          </p>
        </div>
        
        <div className="flex items-center justify-between pt-2">
          <div className="text-sm text-muted-foreground">
            {description.length} / 1000 characters
          </div>
          <Button
            onClick={handleSave}
            disabled={isUpdating || !hasChanges || description.length > 1000}
          >
            {isUpdating ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}