import { redirect } from 'next/navigation';
import { db } from '@/db';
import { users, userEmailPreferencesTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Mail } from 'lucide-react';

interface UnsubscribePageProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const params = await searchParams;
  const { token } = params;

  if (!token) {
    redirect('/login');
  }

  // Decode the email from the token
  let email: string;
  try {
    email = Buffer.from(token, 'base64').toString('utf-8');
  } catch (error) {
    redirect('/login');
  }

  // Find the user
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    redirect('/login');
  }

  // Update preferences to unsubscribe from all
  await db
    .insert(userEmailPreferencesTable)
    .values({
      userId: user.id,
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