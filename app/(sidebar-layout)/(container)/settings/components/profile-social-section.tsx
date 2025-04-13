'use client';

import { Check, Globe, User as UserIcon, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { checkUsernameAvailability, reserveUsername, updateUserSocial } from '@/app/actions/social';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { users } from '@/db/schema';
import { useToast } from '@/hooks/use-toast';

type User = typeof users.$inferSelect;

interface ProfileSocialSectionProps {
  user: User;
}

export function ProfileSocialSection({ user }: ProfileSocialSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();

  // State initialized from the user prop
  const [isPublic, setIsPublic] = useState(user?.is_public || false);
  const [username, setUsername] = useState(user?.username || '');
  const [initialUsername] = useState(user?.username || ''); // Store initial username for comparison
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [usernameMessage, setUsernameMessage] = useState('');
  const [isUpdatingPublic, setIsUpdatingPublic] = useState(false);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  // Update state if the user prop changes (e.g., after parent refresh)
  useEffect(() => {
    setIsPublic(user?.is_public || false);
    setUsername(user?.username || '');
  }, [user]);

  const handleTogglePublic = async (value: boolean) => {
    setIsUpdatingPublic(true);
    try {
      // Call the correct action with userId and is_public update
      const result = await updateUserSocial(user.id, { is_public: value });
      if (result.success) {
        setIsPublic(value);
        toast({
          title: t('common.success'),
          description: t('settings.profile.publicStatusSuccess', 'Profile visibility updated successfully'),
        });
        router.refresh(); // Refresh page data
      } else {
        throw new Error(result.error || 'Failed to update visibility');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description:
          error instanceof Error
            ? error.message
            : t('settings.profile.publicStatusError', 'Failed to update profile visibility'),
        variant: 'destructive',
      });
      // Reset the toggle if it fails based on original prop value
      setIsPublic(user?.is_public || false);
    } finally {
      setIsUpdatingPublic(false);
    }
  };

  const handleUsernameChange = async (value: string) => {
    const trimmedValue = value.trim();
    setUsername(trimmedValue);
    setUsernameAvailable(false); // Reset availability on change
    setUsernameMessage('');

    if (!trimmedValue || trimmedValue === initialUsername) {
      return; // No need to check if empty or unchanged
    }

    setIsCheckingUsername(true);
    try {
      const result = await checkUsernameAvailability(trimmedValue);
      setUsernameAvailable(result.available);
      setUsernameMessage(result.message || '');
    } catch (error) {
      console.error('Error checking username:', error);
      setUsernameAvailable(false);
      setUsernameMessage('Error checking username availability');
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const handleSetUsername = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !usernameAvailable || trimmedUsername === initialUsername) return;

    setIsUpdatingUsername(true);
    try {
      // Call the correct action with userId and the new username
      const result = await reserveUsername(user.id, trimmedUsername);
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('settings.profile.usernameSuccess', 'Username updated successfully'),
        });
        router.refresh(); // Refresh page data
      } else {
        throw new Error(result.error || 'Failed to update username');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description:
          error instanceof Error
            ? error.message
            : t('settings.profile.usernameError', 'Failed to update username'),
        variant: 'destructive',
      });
      // Reset username state to the initial value from props if save fails
      setUsername(initialUsername);
      setUsernameAvailable(false);
      setUsernameMessage('');
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="h-5 w-5" />
          {t('settings.profile.socialTitle', 'Social Profile')}
        </CardTitle>
        <CardDescription>
          {t('settings.profile.socialDescription', 'Manage your public profile and social settings')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Username Field */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-grow">
                <Input
                  id="username"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  className={`pr-10 ${
                    usernameAvailable && username.trim() !== initialUsername
                      ? 'border-green-500 focus-visible:ring-green-500'
                      : ''
                  }`}
                  disabled={isUpdatingUsername || isCheckingUsername}
                />
                {usernameAvailable && username.trim() !== initialUsername && (
                  <Check className="absolute right-3 top-2.5 h-5 w-5 text-green-500" />
                )}
                 {!usernameAvailable && usernameMessage && username.trim() !== initialUsername && (
                  <X className="absolute right-3 top-2.5 h-5 w-5 text-red-500" />
                )}
              </div>
              <Button
                onClick={handleSetUsername}
                disabled={!usernameAvailable || username.trim() === initialUsername || isUpdatingUsername || isCheckingUsername}
              >
                {isUpdatingUsername ? t('common.saving') : t('common.save')}
              </Button>
            </div>
            <div className="h-5 text-xs">
              {isCheckingUsername ? (
                 <span className="text-muted-foreground">Checking availability...</span>
              ) : usernameMessage ? (
                <span className={usernameAvailable ? 'text-green-500' : 'text-red-500'}>
                  {usernameMessage}
                </span>
              ) : (
                <span>&nbsp;</span> // Placeholder to maintain height
              )}
            </div>
          </div>

          {/* Public Profile Toggle */}
          <div className="flex items-center justify-between pt-4 mt-4 border-t">
            <div className="space-y-0.5">
              <Label htmlFor="public-profile" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Public Profile
              </Label>
              <p className="text-sm text-muted-foreground">
                {!username ? (
                  'Set a username first to make your profile public'
                ) : isPublic ? (
                  'Your profile and shared content will be visible to everyone'
                ) : (
                  'Your profile will only be visible to you'
                )}
              </p>
            </div>
            <Switch
              id="public-profile"
              checked={isPublic}
              onCheckedChange={handleTogglePublic}
              disabled={isUpdatingPublic || !username}
            />
          </div>

          {/* Profile URL */}
          <div className="pt-4">
            <p className="text-sm font-medium">Your Profile URL</p>
            {user.username ? (
              <div className="mt-2 flex items-center gap-2">
                <Badge className="font-mono text-xs px-3 py-1 bg-primary/5">
                  plugged.in/to/{user.username}
                </Badge>
                {isPublic && (
                  <Badge className="text-xs">
                    <Check className="h-3 w-3 mr-1" /> Public
                  </Badge>
                )}
              </div>
            ) : (
              <div className="mt-2 p-3 bg-amber-100 dark:bg-amber-950/30 rounded-md text-sm text-amber-800 dark:text-amber-300">
                Set a username above to create your custom public profile URL
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
