'use client';

import { CurrentProfileSection } from './components/current-profile-section';
import { CurrentProjectSection } from './components/current-project-section';
import { ThemeSection } from './components/theme-section';

export default function SettingsPage() {
  return (
    <div>
      <h1 className='text-2xl font-bold mb-6'>Settings</h1>
      <div className='space-y-8'>
        <CurrentProfileSection />
        <CurrentProjectSection />
        <ThemeSection />
      </div>
    </div>
  );
}
