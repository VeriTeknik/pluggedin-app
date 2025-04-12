import './globals.css';

import type { Metadata } from 'next';
import { Geist, Geist_Mono, Quicksand } from 'next/font/google'; // Import Quicksand
import { Toaster as SonnerToaster } from 'sonner';

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

// Load Quicksand font using next/font
const quicksand = Quicksand({
  variable: '--font-quicksand',
  weight: ['400', '500', '600', '700'], // Specify the weights needed
  subsets: ['latin'],
  display: 'swap', // Match the display=swap from the original link
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
      {/* Removed the <link> tag for Quicksand font */}
      
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${quicksand.variable} antialiased`}> {/* Add quicksand variable */}
        <I18nProviderWrapper>
          <ThemeProvider defaultTheme="system" storageKey="pluggedin-theme">
            <SessionProvider>
              <NotificationProvider>
                <LanguageSwitcher />
                {children}
              </NotificationProvider>
            </SessionProvider>
            <Toaster />
            <SonnerToaster position="bottom-right" />
          </ThemeProvider>
        </I18nProviderWrapper>
      </body>
    </html>
  );
}
