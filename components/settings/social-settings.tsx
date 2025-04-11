'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { updateProfileSocial } from '@/app/actions/social';
import { Profile } from '@/types/profile';

interface SocialSettingsProps {
  profile: Profile;
}

export function SocialSettings({ profile }: SocialSettingsProps) {
  const router = useRouter();
  const [bio, setBio] = useState(profile.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [isPublic, setIsPublic] = useState(profile.is_public || false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updateProfileSocial(profile.uuid, {
        bio,
        avatar_url: avatarUrl,
        is_public: isPublic,
      });

      if (result.success) {
        setSuccess('Profile social settings updated successfully!');
        router.refresh();
      } else {
        setError(result.error || 'Failed to update profile social settings');
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
        <p>
          Your public profile is available at:{' '}
          <span className="font-medium text-foreground">
            plugged.in/to/{profile.username || 'your-username'}
          </span>
        </p>
        {!profile.username && (
          <p className="mt-2 text-amber-500">
            You need to set a username in the Username settings to make your profile accessible.
          </p>
        )}
      </CardFooter>
    </Card>
  );
} 