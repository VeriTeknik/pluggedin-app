import './globals.css';

import type { Metadata } from 'next';
import { Toaster as SonnerToaster } from 'sonner';
import { 
  Comfortaa,
  Geist, 
  Geist_Mono, 
  Nunito,
  Poppins,
  Quicksand,
  Roboto,
  Ubuntu,
  Work_Sans,
  Zilla_Slab,
} from 'next/font/google';

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

const quicksand = Quicksand({
  variable: '--font-quicksand',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const nunito = Nunito({
  variable: '--font-nunito',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const poppins = Poppins({
  variable: '--font-poppins',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const roboto = Roboto({
  variable: '--font-roboto',
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const ubuntu = Ubuntu({
  variable: '--font-ubuntu',
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const workSans = Work_Sans({
  variable: '--font-work-sans',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const zillaSlab = Zilla_Slab({
  variable: '--font-zilla-slab',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const comfortaa = Comfortaa({
  variable: '--font-comfortaa',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
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
        className={`${geistSans.variable} ${geistMono.variable} ${quicksand.variable} ${nunito.variable} ${poppins.variable} ${roboto.variable} ${ubuntu.variable} ${workSans.variable} ${zillaSlab.variable} ${comfortaa.variable} antialiased`}>
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
