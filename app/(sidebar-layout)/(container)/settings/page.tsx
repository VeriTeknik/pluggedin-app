import { redirect } from 'next/navigation';

import { getAuthSession } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

import { getConnectedAccounts } from './actions';
import { SettingsForm } from './components/settings-form';

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

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>
        <SettingsForm 
          user={user}
          connectedAccounts={connectedAccounts}
        />
      </div>
    </div>
  );
}
