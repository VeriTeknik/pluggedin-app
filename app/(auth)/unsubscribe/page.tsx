import { AlertCircle,Mail } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/db';
import { userEmailPreferencesTable } from '@/db/schema';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-tokens';

interface UnsubscribePageProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const params = await searchParams;
  const { token } = params;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle>Invalid Unsubscribe Link</CardTitle>
            <CardDescription>
              This unsubscribe link is invalid or has expired
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Please use the unsubscribe link from a recent email, or manage your preferences from your account settings.
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/settings">
                <Button variant="outline" className="w-full">
                  Go to settings
                </Button>
              </Link>
              <Link href="/">
                <Button className="w-full">
                  Go to homepage
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verify the secure token
  const userId = await verifyUnsubscribeToken(token);

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle>Invalid or Expired Token</CardTitle>
            <CardDescription>
              This unsubscribe link has expired or already been used
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Unsubscribe links expire after 48 hours for security reasons. Please request a new unsubscribe link from a recent email.
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/settings">
                <Button variant="outline" className="w-full">
                  Manage email preferences
                </Button>
              </Link>
              <Link href="/">
                <Button className="w-full">
                  Go to homepage
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Update preferences to unsubscribe from all
  await db
    .insert(userEmailPreferencesTable)
    .values({
      userId: userId,
      welcomeEmails: false,
      productUpdates: false,
      marketingEmails: false,
      adminNotifications: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userEmailPreferencesTable.userId,
      set: {
        welcomeEmails: false,
        productUpdates: false,
        marketingEmails: false,
        adminNotifications: false,
        updatedAt: new Date(),
      },
    });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <Mail className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle>You've been unsubscribed</CardTitle>
          <CardDescription>
            You will no longer receive emails from Plugged.in
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            We're sorry to see you go. You've been successfully unsubscribed from all email communications.
          </p>

          <div className="flex flex-col gap-2">
            <Link href="/settings">
              <Button variant="outline" className="w-full">
                Manage email preferences
              </Button>
            </Link>
            <Link href="/">
              <Button className="w-full">
                Go to homepage
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Changed your mind? You can re-enable emails anytime from your{' '}
            <Link href="/settings" className="underline">
              account settings
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}