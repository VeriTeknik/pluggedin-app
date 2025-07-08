import './globals.css';
import '@/styles/fonts.css';

import type { Metadata } from 'next';
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
import Script from 'next/script'; // Import the Script component
import { Toaster as SonnerToaster } from 'sonner';

import { I18nProviderWrapper } from '@/components/providers/i18n-provider-wrapper';
import { NotificationProvider } from '@/components/providers/notification-provider';
import { SessionProvider } from '@/components/providers/session-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { Toaster } from '@/components/ui/toaster';
import { initializeFont } from '@/lib/font-utils';

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

// Get the GA ID from environment variables
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_ID;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize font on the client side
  if (typeof window !== 'undefined') {
    initializeFont();
  }

  return (
    <html lang='en' suppressHydrationWarning>
      <head>
      {/* Removed the <link> tag for Quicksand font */}

        {/* Google Analytics Scripts */}
        {gaMeasurementId && (
          <>
            <Script
              strategy="afterInteractive" // Load after page becomes interactive
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaMeasurementId}', {
                    page_path: window.location.pathname,
                  });
                `,
              }}
            />
          </>
        )}
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${quicksand.variable} ${nunito.variable} ${poppins.variable} ${roboto.variable} ${ubuntu.variable} ${workSans.variable} ${zillaSlab.variable} ${comfortaa.variable} antialiased`}>
        <ThemeProvider defaultTheme="system" storageKey="pluggedin-theme">
          <SessionProvider>
            <I18nProviderWrapper>
              <NotificationProvider>
                <LanguageSwitcher />
                {children}
              </NotificationProvider>
            </I18nProviderWrapper>
          </SessionProvider>
          <Toaster />
          <SonnerToaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
