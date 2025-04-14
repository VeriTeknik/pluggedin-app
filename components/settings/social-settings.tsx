'use client';

import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { updateUserSocial } from '@/app/actions/social'; // Changed import
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
// Assuming User type is defined elsewhere or we import it from schema
import { users } from '@/db/schema'; // Import schema to get User type
type User = typeof users.$inferSelect;

interface SocialSettingsProps {
  user: User; // Changed prop from profile to user
}

export function SocialSettings({ user }: SocialSettingsProps) { // Destructure user
  const router = useRouter();
  // Initialize state from user prop
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || ''); // Use user.avatar_url
  const [isPublic, setIsPublic] = useState(user.is_public || false); // Use user.is_public
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Call updateUserSocial with user.id
      const result = await updateUserSocial(user.id, { 
        bio,
        avatar_url: avatarUrl,
        is_public: isPublic,
        // Assuming language setting might be handled elsewhere or added here later
      });

      if (result.success) {
        setSuccess('User social settings updated successfully!'); // Updated success message
        router.refresh();
      } else {
        setError(result.error || 'Failed to update user social settings'); // Updated error message
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Social Profile
        </CardTitle>
        <CardDescription>
          Manage your public profile information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                disabled={isSubmitting}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                A brief description that appears on your public profile.
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="avatarUrl">Avatar URL</Label>
              <Input
                id="avatarUrl"
                placeholder="https://example.com/avatar.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                A URL to an image that will be displayed as your avatar.
              </p>
            </div>
            
            <div className="flex items-center justify-between space-x-2 mt-2">
              <Label htmlFor="isPublic" className="cursor-pointer">Make profile public</Label>
              <Switch
                id="isPublic"
                checked={isPublic}
                onCheckedChange={setIsPublic}
                disabled={isSubmitting}
              />
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              When enabled, your profile will be visible to anyone who visits your profile page.
            </p>
            
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
          </div>
          <Button 
            type="submit" 
            className="mt-4" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Profile'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="border-t pt-6 text-sm text-muted-foreground flex flex-col items-start">
        {/* Use user.username */}
        <p>
          Your public profile is available at:{' '}
          <span className="font-medium text-foreground">
            plugged.in/to/{user.username || 'your-username'} 
          </span>
        </p>
        {!user.username && ( // Check user.username
          <p className="mt-2 text-amber-500">
            You need to set a username in the Username settings to make your profile accessible.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
