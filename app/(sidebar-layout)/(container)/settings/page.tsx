import { getAuthSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SettingsForm } from './components/settings-form';
import { getConnectedAccounts } from './actions';

export default async function SettingsPage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect('/login');
  }

  const connectedAccounts = await getConnectedAccounts(session.user.id);

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>
        <SettingsForm 
          user={{
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            image: session.user.image,
            emailVerified: session.user.emailVerified,
          }}
          connectedAccounts={connectedAccounts}
        />
      </div>
    </div>
  );
}
