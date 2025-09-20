import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

import { getConnectedAccounts, getUserEmailPreferences } from './actions';
import { EmailPreferencesSection } from './components/email-preferences-section';
import { SettingsForm } from './components/settings-form';
import { SettingsTitle } from './components/settings-title';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect('/login');
  }

  // Fetch complete user data including social fields
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!user) {
    redirect('/login');
  }

  // Fetch connected account providers
  const connectedAccounts = await getConnectedAccounts(session.user.id);

  // Fetch email preferences
  const emailPreferences = await getUserEmailPreferences(session.user.id);

  // Transform null values to undefined for the component
  const transformedPreferences = emailPreferences ? {
    welcomeEmails: emailPreferences.welcomeEmails ?? undefined,
    productUpdates: emailPreferences.productUpdates ?? undefined,
    marketingEmails: emailPreferences.marketingEmails ?? undefined,
    adminNotifications: emailPreferences.adminNotifications ?? undefined,
    notificationSeverity: emailPreferences.notificationSeverity ?? undefined,
  } : undefined;

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <SettingsTitle />
        <SettingsForm
          user={user}
          connectedAccounts={connectedAccounts}
        />
        <EmailPreferencesSection
          userId={session.user.id}
          preferences={transformedPreferences}
        />
      </div>
    </div>
  );
}
