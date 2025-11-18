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

import { AnalyticsProvider } from '@/components/analytics/analytics-provider';
import { WebVitalsReporter } from '@/components/analytics/web-vitals';
import { I18nProviderWrapper } from '@/components/providers/i18n-provider-wrapper';
import { NotificationProvider } from '@/components/providers/notification-provider';
import { SessionProvider } from '@/components/providers/session-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { StructuredData } from '@/components/seo/structured-data';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { Toaster } from '@/components/ui/toaster';
import { ProjectsProvider } from '@/contexts/ProjectsContext';
import { getNonce } from '@/lib/csp-nonce';

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
  metadataBase: new URL('https://plugged.in'),
  title: {
    default: 'Plugged.in - Enterprise MCP Platform for AI Integration',
    template: '%s | Plugged.in'
  },
  description: 'Plugged.in is the enterprise Model Context Protocol (MCP) platform for seamless AI integration. Connect 7,000+ tools and 1,500+ MCP servers with SOC 2 certified security. Start free today.',
  keywords: [
    'MCP platform',
    'Model Context Protocol',
    'AI integration',
    'enterprise AI',
    'MCP servers',
    'AI tools integration',
    'Claude integration',
    'GPT integration',
    'AI development platform',
    'enterprise AI platform',
    'SOC 2 compliance',
    'AI security',
    'AI orchestration',
    'AI automation',
    'developer tools',
    'AI infrastructure',
    'multi-agent systems',
    'AI workflow automation'
  ],
  authors: [{ name: 'Plugged.in Team' }],
  creator: 'Plugged.in',
  publisher: 'Plugged.in',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://plugged.in',
    title: 'Plugged.in - Enterprise MCP Platform for AI Integration',
    description: 'The leading enterprise Model Context Protocol platform. Connect 7,000+ tools, 1,500+ MCP servers with enterprise-grade security. SOC 2 certified, GDPR compliant.',
    siteName: 'Plugged.in',
    images: [
      {
        url: 'https://plugged.in/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Plugged.in - Enterprise MCP Platform Dashboard',
        type: 'image/png',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Plugged.in - Enterprise MCP Platform for AI Integration',
    description: 'Enterprise Model Context Protocol platform. 7,000+ tools, 1,500+ MCP servers, SOC 2 certified. Start free.',
    creator: '@pluggedin',
    site: '@pluggedin',
    images: ['https://plugged.in/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://plugged.in',
    languages: {
      'en-US': 'https://plugged.in',
      'tr-TR': 'https://plugged.in?lang=tr',
      'zh-CN': 'https://plugged.in?lang=zh',
      'hi-IN': 'https://plugged.in?lang=hi',
      'ja-JP': 'https://plugged.in?lang=ja',
      'nl-NL': 'https://plugged.in?lang=nl',
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  category: 'technology',
  classification: 'Software Development',
};

// Get the GA ID from environment variables
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_ID;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get nonce for CSP-compliant inline scripts
  const nonce = await getNonce();

  return (
    <html lang='en' suppressHydrationWarning>
      <head>
      {/* Removed the <link> tag for Quicksand font */}

        {/* Additional SEO tags */}
        <meta name="application-name" content="Plugged.in" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Plugged.in" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#06b6d4" />

        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />

        {/* Google Analytics Scripts with CSP nonce */}
        {gaMeasurementId && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              {...(nonce && { nonce })}
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              {...(nonce && { nonce })}
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', ${JSON.stringify(gaMeasurementId)}, {
                    page_path: window.location.pathname,
                  });
                `,
              }}
            />
            {process.env.NODE_ENV === 'development' && (
              <Script
                id="ga-debug"
                strategy="afterInteractive"
                {...(nonce && { nonce })}
                dangerouslySetInnerHTML={{
                  __html: `
                    (function() {
                      var checkGA = function() {
                        if (typeof gtag === 'undefined' || typeof window.dataLayer === 'undefined') {
                          console.error('[GA] Failed to initialize. Check for ad blockers or CSP issues.');
                        } else {
                          console.log('[GA] Initialized successfully');
                        }
                      };
                      setTimeout(checkGA, 2000);
                    })();
                  `,
                }}
              />
            )}
          </>
        )}
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${quicksand.variable} ${nunito.variable} ${poppins.variable} ${roboto.variable} ${ubuntu.variable} ${workSans.variable} ${zillaSlab.variable} ${comfortaa.variable} antialiased`}>
        <StructuredData type="Organization" />
        <StructuredData type="WebSite" />
        <StructuredData type="Product" />
        <StructuredData type="FAQPage" />
        <ThemeProvider defaultTheme="system" storageKey="pluggedin-theme">
          <SessionProvider>
            <I18nProviderWrapper>
              <ProjectsProvider>
                <NotificationProvider>
                  <AnalyticsProvider>
                    <div suppressHydrationWarning>
                      <LanguageSwitcher />
                    </div>
                    {children}
                  </AnalyticsProvider>
                </NotificationProvider>
              </ProjectsProvider>
            </I18nProviderWrapper>
          </SessionProvider>
          <WebVitalsReporter
            analyticsEnabled={process.env.NODE_ENV === 'production'}
            debug={process.env.NODE_ENV === 'development'}
            reportToConsole={process.env.NODE_ENV === 'development'}
          />
          <Toaster />
          <SonnerToaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
