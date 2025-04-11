'use client';

import { User, Globe, Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateProfilePublicStatus } from '@/app/actions/profiles';
import { reserveUsername, checkUsernameAvailability } from '@/app/actions/social';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export function ProfileSocialSection() {
  const { t } = useTranslation();
  const { currentProfile, mutateProfiles } = useProfiles();
  const [isPublic, setIsPublic] = useState(currentProfile?.is_public || false);
  const [username, setUsername] = useState(currentProfile?.username || '');
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [usernameMessage, setUsernameMessage] = useState('');
  const [isUpdatingPublic, setIsUpdatingPublic] = useState(false);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!currentProfile) return;
    setIsPublic(currentProfile?.is_public || false);
    setUsername(currentProfile?.username || '');
  }, [currentProfile]);

  if (!currentProfile) {
    return <span>{t('settings.profile.loading', 'Loading Profile...')}</span>;
  }

  const handleTogglePublic = async (value: boolean) => {
    setIsUpdatingPublic(true);
    try {
      await updateProfilePublicStatus(currentProfile.uuid, value);
      setIsPublic(value);
      await mutateProfiles();
      toast({
        title: t('common.success'),
        description: t('settings.profile.publicStatusSuccess', 'Profile visibility updated successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description:
          error instanceof Error
            ? error.message
            : t('settings.profile.publicStatusError', 'Failed to update profile visibility'),
        variant: 'destructive',
      });
      // Reset the toggle if it fails
      setIsPublic(currentProfile.is_public || false);
    } finally {
      setIsUpdatingPublic(false);
    }
  };

  const handleUsernameChange = async (value: string) => {
    setUsername(value);
    
    if (!value.trim() || value === currentProfile.username) {
      setUsernameAvailable(false);
      setUsernameMessage('');
      return;
    }
    
    setIsCheckingUsername(true);
    try {
      const result = await checkUsernameAvailability(value);
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
    if (!username.trim() || !usernameAvailable) return;
    
    setIsUpdatingUsername(true);
    try {
      const result = await reserveUsername(currentProfile.uuid, username);
      
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('settings.profile.usernameSuccess', 'Username updated successfully'),
        });
        await mutateProfiles();
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
      // Reset to current username
      setUsername(currentProfile.username || '');
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
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
                    usernameAvailable && username.trim() !== currentProfile.username
                      ? 'border-green-500 focus-visible:ring-green-500'
                      : ''
                  }`}
                  disabled={isUpdatingUsername}
                />
                {usernameAvailable && username.trim() !== currentProfile.username && (
                  <Check className="absolute right-3 top-2.5 h-5 w-5 text-green-500" />
                )}
              </div>
              <Button
                onClick={handleSetUsername}
                disabled={!usernameAvailable || username.trim() === currentProfile.username || isUpdatingUsername}
              >
                {isUpdatingUsername ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <div className="h-5">
              {usernameMessage && (
                <p className={`text-xs ${usernameAvailable ? 'text-green-500' : 'text-red-500'}`}>
                  {usernameMessage}
                </p>
              )}
              {isCheckingUsername && (
                <p className="text-xs text-muted-foreground">Checking availability...</p>
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
                {isPublic
                  ? 'Your profile and shared content will be visible to everyone'
                  : 'Your profile will only be visible to you'}
              </p>
            </div>
            <Switch
              id="public-profile"
              checked={isPublic}
              onCheckedChange={handleTogglePublic}
              disabled={isUpdatingPublic}
            />
          </div>

          {/* Profile URL */}
          <div className="pt-4">
            <p className="text-sm font-medium">Your Profile URL</p>
            {currentProfile.username ? (
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs px-3 py-1 bg-primary/5">
                  plugged.in/to/{currentProfile.username}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  <Check className="h-3 w-3 mr-1" /> Active
                </Badge>
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