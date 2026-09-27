import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { reauthenticatedUntil } from '@/lib/credential-reverification';

import { getConnectedAccounts, getUserEmailPreferences } from './actions';
import { EmailPreferencesSection } from './components/email-preferences-section';
import { SettingsForm } from './components/settings-form';
import { SettingsTitle } from './components/settings-title';

export const dynamic = 'force-dynamic';

/** Providers the sign-in page offers; anything else in the query is ignored. */
const LINKABLE_PROVIDERS = new Set(['github', 'google', 'twitter']);

/**
 * The provider whose link the signIn callback refused (lib/auth.ts redirects
 * here with linkError=reauth_required&provider=<id>), if the query says so.
 */
function refusedLinkFrom(query: Record<string, string | string[] | undefined>): string | null {
  const { linkError, provider } = query;
  if (linkError !== 'reauth_required' || typeof provider !== 'string') return null;
  return LINKABLE_PROVIDERS.has(provider) ? provider : null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  const connectedAccounts = await getConnectedAccounts();

  // Linking another provider needs a recent sign-in by this session; the form
  // asks for one up front when this is null (the server enforces it anyway).
  const reauthValidUntil = reauthenticatedUntil(session, {
    linkedProviders: connectedAccounts.map((account) => account.provider),
    hasPassword: !!user.password,
    passwordChangedAt: user.password_changed_at,
  });
  const refusedLink = refusedLinkFrom((await searchParams) ?? {});

  // Fetch email preferences
  const emailPreferences = await getUserEmailPreferences();

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
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            hasPassword: !!user.password,
          }}
          connectedAccounts={connectedAccounts}
          reauthValidUntil={reauthValidUntil}
          refusedLink={refusedLink}
        />
        <EmailPreferencesSection
          preferences={transformedPreferences}
        />
      </div>
    </div>
  );
}
