'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Bell, TrendingUp, Megaphone, Shield } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { updateEmailPreferences } from '../actions';

interface EmailPreferencesProps {
  userId: string;
  preferences?: {
    welcomeEmails?: boolean;
    productUpdates?: boolean;
    marketingEmails?: boolean;
    adminNotifications?: boolean;
    notificationSeverity?: string;
  };
}

export function EmailPreferencesSection({ userId, preferences }: EmailPreferencesProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [emailPrefs, setEmailPrefs] = useState({
    welcomeEmails: preferences?.welcomeEmails ?? true,
    productUpdates: preferences?.productUpdates ?? true,
    marketingEmails: preferences?.marketingEmails ?? false,
    adminNotifications: preferences?.adminNotifications ?? true,
  });

  const handleToggle = (key: keyof typeof emailPrefs) => {
    setEmailPrefs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const result = await updateEmailPreferences(userId, emailPrefs);

      if (result.success) {
        toast({
          title: 'Preferences updated',
          description: 'Your email preferences have been saved.',
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update email preferences. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribeAll = async () => {
    setIsLoading(true);
    const allOff = {
      welcomeEmails: false,
      productUpdates: false,
      marketingEmails: false,
      adminNotifications: false,
    };

    try {
      const result = await updateEmailPreferences(userId, allOff);

      if (result.success) {
        setEmailPrefs(allOff);
        toast({
          title: 'Unsubscribed',
          description: 'You have been unsubscribed from all emails.',
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to unsubscribe. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Preferences
        </CardTitle>
        <CardDescription>
          Manage your email notification preferences and consent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {/* Welcome & Onboarding Emails */}
          <div className="flex items-start justify-between space-x-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="welcome-emails" className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Welcome & Onboarding
              </Label>
              <p className="text-sm text-muted-foreground">
                Initial setup guides, tips for getting started, and milestone achievements
              </p>
            </div>
            <Switch
              id="welcome-emails"
              checked={emailPrefs.welcomeEmails}
              onCheckedChange={() => handleToggle('welcomeEmails')}
              disabled={isLoading}
            />
          </div>

          {/* Product Updates */}
          <div className="flex items-start justify-between space-x-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="product-updates" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Product Updates
              </Label>
              <p className="text-sm text-muted-foreground">
                New features, improvements, and important changes to the platform
              </p>
            </div>
            <Switch
              id="product-updates"
              checked={emailPrefs.productUpdates}
              onCheckedChange={() => handleToggle('productUpdates')}
              disabled={isLoading}
            />
          </div>

          {/* Marketing & Promotional */}
          <div className="flex items-start justify-between space-x-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="marketing-emails" className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
                Marketing & Promotional
              </Label>
              <p className="text-sm text-muted-foreground">
                Special offers, community events, and partner integrations
              </p>
            </div>
            <Switch
              id="marketing-emails"
              checked={emailPrefs.marketingEmails}
              onCheckedChange={() => handleToggle('marketingEmails')}
              disabled={isLoading}
            />
          </div>

          {/* Admin Notifications (if user is admin) */}
          <div className="flex items-start justify-between space-x-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="admin-notifications" className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Security & Account Alerts
              </Label>
              <p className="text-sm text-muted-foreground">
                Important security updates, login attempts, and account changes
              </p>
            </div>
            <Switch
              id="admin-notifications"
              checked={emailPrefs.adminNotifications}
              onCheckedChange={() => handleToggle('adminNotifications')}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleUnsubscribeAll}
            disabled={isLoading}
          >
            Unsubscribe from all
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save preferences'}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground pt-2">
          <p>
            We respect your privacy and will only send emails you've consented to receive.
            You can update these preferences at any time. For more information, see our{' '}
            <a href="/privacy" className="underline">Privacy Policy</a>.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}