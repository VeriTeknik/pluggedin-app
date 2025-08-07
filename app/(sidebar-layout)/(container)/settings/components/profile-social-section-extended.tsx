'use client';

import { Building, Check, Github,Globe, Link, MapPin, Twitter, User as UserIcon, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { checkUsernameAvailability, reserveUsername, updateUserSocial } from '@/app/actions/social';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { users } from '@/db/schema';

type User = typeof users.$inferSelect;

interface ProfileSocialSectionProps {
  user: User;
  embeddedChats?: Array<{
    uuid: string;
    name: string;
    slug: string | null;
    is_public: boolean;
    is_active: boolean;
  }>;
}

export function ProfileSocialSection({ user, embeddedChats = [] }: ProfileSocialSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();

  // State initialized from the user prop
  const [isPublic, setIsPublic] = useState(user?.is_public || false);
  const [username, setUsername] = useState(user?.username || '');
  const [initialUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [location, setLocation] = useState(user?.location || '');
  const [company, setCompany] = useState(user?.company || '');
  const [twitterHandle, setTwitterHandle] = useState(user?.twitter_handle || '');
  const [githubHandle, setGithubHandle] = useState(user?.github_handle || '');
  
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [usernameMessage, setUsernameMessage] = useState('');
  const [isUpdatingPublic, setIsUpdatingPublic] = useState(false);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  // Update state if the user prop changes
  useEffect(() => {
    setIsPublic(user?.is_public || false);
    setUsername(user?.username || '');
    setBio(user?.bio || '');
    setWebsite(user?.website || '');
    setLocation(user?.location || '');
    setCompany(user?.company || '');
    setTwitterHandle(user?.twitter_handle || '');
    setGithubHandle(user?.github_handle || '');
  }, [user]);

  // Debounced username availability check
  const checkUsernameDebounced = useCallback(
    async (value: string) => {
      if (!value || value === initialUsername) {
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
    },
    [initialUsername]
  );

  // Set up debounce effect
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedValue = username.trim();
      if (trimmedValue) {
        checkUsernameDebounced(trimmedValue);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, checkUsernameDebounced]);

  const handleTogglePublic = async (value: boolean) => {
    setIsUpdatingPublic(true);
    try {
      const result = await updateUserSocial(user.id, { is_public: value });
      if (result.success) {
        setIsPublic(value);
        toast({
          title: t('common.success'),
          description: t('settings.profile.publicStatusSuccess', 'Profile visibility updated successfully'),
        });
        router.refresh();
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
      setIsPublic(user?.is_public || false);
    } finally {
      setIsUpdatingPublic(false);
    }
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameAvailable(false);
    setUsernameMessage('');
  };

  const handleSetUsername = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !usernameAvailable || trimmedUsername === initialUsername) return;

    setIsUpdatingUsername(true);
    try {
      const result = await reserveUsername(user.id, trimmedUsername);
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('settings.profile.usernameSuccess', 'Username updated successfully'),
        });
        router.refresh();
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
      setUsername(initialUsername);
      setUsernameAvailable(false);
      setUsernameMessage('');
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const handleUpdateProfile = async () => {
    setIsUpdatingProfile(true);
    try {
      const result = await updateUserSocial(user.id, {
        bio: bio.trim(),
        website: website.trim(),
        location: location.trim(),
        company: company.trim(),
        twitter_handle: twitterHandle.trim().replace('@', ''),
        github_handle: githubHandle.trim().replace('@', ''),
      });
      
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('settings.profile.updateSuccess', 'Profile updated successfully'),
        });
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to update profile');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description:
          error instanceof Error
            ? error.message
            : t('settings.profile.updateError', 'Failed to update profile'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const publicChats = embeddedChats.filter(chat => chat.is_public && chat.is_active);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            {t('settings.profile.social.title', 'Social Profile')}
          </CardTitle>
          <CardDescription>
            {t('settings.profile.social.description', 'Manage your public profile and social presence')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Username Field */}
          <div className="space-y-2">
            <Label htmlFor="username">{t('settings.profile.social.username.label', 'Username')}</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-grow">
                <Input
                  id="username"
                  placeholder={t('settings.profile.social.username.placeholder', 'Choose a username')}
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
                disabled={!usernameAvailable || username.trim() === initialUsername || isUpdatingUsername}
              >
                {isUpdatingUsername ? t('common.saving') : t('settings.profile.social.username.save', 'Save')}
              </Button>
            </div>
            <div className="h-5 text-xs">
              {isCheckingUsername ? (
                <span className="text-muted-foreground">{t('settings.profile.social.username.checking', 'Checking...')}</span>
              ) : usernameMessage ? (
                <span className={usernameAvailable ? 'text-green-500' : 'text-red-500'}>
                  {usernameMessage}
                </span>
              ) : (
                <span>&nbsp;</span>
              )}
            </div>
          </div>

          {/* Bio Field */}
          <div className="space-y-2">
            <Label htmlFor="bio">{t('settings.profile.social.bio.label', 'Bio')}</Label>
            <Textarea
              id="bio"
              placeholder={t('settings.profile.social.bio.placeholder', 'Tell us about yourself...')}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
          </div>

          {/* Additional Fields */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website" className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                {t('settings.profile.social.website.label', 'Website')}
              </Label>
              <Input
                id="website"
                type="url"
                placeholder="https://example.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {t('settings.profile.social.location.label', 'Location')}
              </Label>
              <Input
                id="location"
                placeholder="San Francisco, CA"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                {t('settings.profile.social.company.label', 'Company')}
              </Label>
              <Input
                id="company"
                placeholder="Acme Inc."
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="twitter" className="flex items-center gap-2">
                <Twitter className="h-4 w-4" />
                {t('settings.profile.social.twitter.label', 'Twitter/X')}
              </Label>
              <Input
                id="twitter"
                placeholder="@username"
                value={twitterHandle}
                onChange={(e) => setTwitterHandle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="github" className="flex items-center gap-2">
                <Github className="h-4 w-4" />
                {t('settings.profile.social.github.label', 'GitHub')}
              </Label>
              <Input
                id="github"
                placeholder="username"
                value={githubHandle}
                onChange={(e) => setGithubHandle(e.target.value)}
              />
            </div>
          </div>

          {/* Save Profile Button */}
          <Button 
            onClick={handleUpdateProfile} 
            disabled={isUpdatingProfile}
            className="w-full"
          >
            {isUpdatingProfile ? t('common.saving') : t('settings.profile.social.saveProfile', 'Save Profile')}
          </Button>

          {/* Public Profile Toggle */}
          <div className="flex items-center justify-between pt-4 mt-4 border-t">
            <div className="space-y-0.5">
              <Label htmlFor="public-profile" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t('settings.profile.social.publicProfile.title', 'Public Profile')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {!username
                  ? t('settings.profile.social.publicProfile.description.noUsername', 'Set a username to enable public profile')
                  : isPublic
                  ? t('settings.profile.social.publicProfile.description.public', 'Your profile is visible to everyone')
                  : t('settings.profile.social.publicProfile.description.private', 'Your profile is private')}
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
          {user.username && (
            <div className="pt-4">
              <Label className="text-sm">{t('settings.profile.profileUrl.title', 'Profile URL')}</Label>
              <div className="mt-2 flex items-center gap-2">
                <a
                  href={`/to/${user.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-1 px-3 py-1.5 bg-muted rounded-md text-sm text-foreground font-mono">
                    plugged.in/to/{user.username}
                  </div>
                </a>
                {isPublic && (
                  <Badge variant="secondary" className="text-xs">
                    <Check className="h-3 w-3 mr-1" /> {t('settings.profile.public', 'Public')}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Chats Card */}
      {embeddedChats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.profile.availableChats.title', 'Available AI Assistants')}</CardTitle>
            <CardDescription>
              {t('settings.profile.availableChats.description', 'Manage your embedded chat assistants')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {embeddedChats.map((chat) => (
                <div key={chat.uuid} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{chat.name}</div>
                    {chat.slug && (
                      <div className="text-xs text-muted-foreground font-mono">
                        /to/{user.username}/{chat.slug}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {chat.is_public && chat.is_active ? (
                      <Badge variant="default" className="text-xs">
                        {t('settings.profile.chat.public', 'Public')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        {t('settings.profile.chat.private', 'Private')}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/embedded-chat/${chat.uuid}`)}
                    >
                      {t('settings.profile.chat.configure', 'Configure')}
                    </Button>
                  </div>
                </div>
              ))}
              {publicChats.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('settings.profile.noPublicChats', 'No public chats available. Configure a chat and make it public to show on your profile.')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}