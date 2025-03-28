import './globals.css';

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { I18nProviderWrapper } from '@/components/providers/i18n-provider-wrapper';
import { NotificationProvider } from '@/components/providers/notification-provider';
import { SessionProvider } from '@/components/providers/session-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { Toaster } from '@/components/ui/toaster';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Plugged.in',
  description: 'Plugged.in. The AI crossroads.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" />
      
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <I18nProviderWrapper>
          <ThemeProvider defaultTheme="system" storageKey="pluggedin-theme">
            <SessionProvider>
              <NotificationProvider>
                <LanguageSwitcher />
                {children}
              </NotificationProvider>
            </SessionProvider>
            <Toaster />
          </ThemeProvider>
        </I18nProviderWrapper>
      </body>
    </html>
  );
}
