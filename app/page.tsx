import dynamicImport from 'next/dynamic';
import { Suspense } from 'react';

// Force dynamic rendering because this page uses server components with data fetching
export const dynamic = 'force-dynamic';

import { Footer } from '@/components/footer';
import { LandingNavbar } from '@/components/landing-navbar';
// Critical above-the-fold component loaded immediately
import { HeroPluginSection } from '@/components/landing-sections/hero-plugin';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { MetricsProvider } from '@/contexts/metrics-context';

// Loading skeleton component
const SectionLoader = ({ height = '400px' }: { height?: string }) => (
  <div className="flex items-center justify-center" style={{ minHeight: height }}>
    <div className="animate-pulse">
      <div className="h-8 w-48 bg-muted rounded mb-4 mx-auto" />
      <div className="h-4 w-32 bg-muted rounded mx-auto" />
    </div>
  </div>
);

// Section 2: Scenarios
const ScenariosSection = dynamicImport(
  () => import('@/components/landing-sections/scenarios').then(mod => ({ default: mod.ScenariosSection })),
  { loading: () => <SectionLoader />, ssr: true }
);

// Section 3: How It Works
const HowItWorksSection = dynamicImport(
  () => import('@/components/landing-sections/how-it-works').then(mod => ({ default: mod.HowItWorksSection })),
  { loading: () => <SectionLoader />, ssr: true }
);

// Section 4: Terminal Demo (animated hook lifecycle)
const TerminalDemoSection = dynamicImport(
  () => import('@/components/landing-sections/terminal-demo').then(mod => ({ default: mod.TerminalDemoSection })),
  { loading: () => <SectionLoader height="600px" />, ssr: true }
);

// Section 5: Privacy
const PrivacySection = dynamicImport(
  () => import('@/components/landing-sections/privacy').then(mod => ({ default: mod.PrivacySection })),
  { loading: () => <SectionLoader />, ssr: true }
);

// Section 6: Platform Capabilities
const PlatformCapabilitiesSection = dynamicImport(
  () => import('@/components/landing-sections/platform-capabilities').then(mod => ({ default: mod.PlatformCapabilitiesSection })),
  { loading: () => <SectionLoader />, ssr: true }
);

// Section 7: CTA
const CtaPluginSection = dynamicImport(
  () => import('@/components/landing-sections/cta-plugin').then(mod => ({ default: mod.CtaPluginSection })),
  { loading: () => <SectionLoader height="300px" />, ssr: true }
);

export default function Home() {
  return (
    <MetricsProvider>
      <div className="flex flex-col min-h-screen">
        <LandingNavbar />
        <main className="flex-grow">
          {/* Section 1: Hero — plugin install CTA */}
          <ErrorBoundary sectionName="Hero">
            <HeroPluginSection />
          </ErrorBoundary>

          {/* Section 2: Scenarios */}
          <Suspense fallback={<SectionLoader />}>
            <ErrorBoundary sectionName="Scenarios">
              <ScenariosSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 3: How It Works */}
          <Suspense fallback={<SectionLoader />}>
            <ErrorBoundary sectionName="How It Works">
              <HowItWorksSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 4: Terminal Demo — animated hook lifecycle */}
          <Suspense fallback={<SectionLoader height="600px" />}>
            <ErrorBoundary sectionName="Terminal Demo">
              <TerminalDemoSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 5: Privacy */}
          <Suspense fallback={<SectionLoader />}>
            <ErrorBoundary sectionName="Privacy">
              <PrivacySection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 6: Platform Capabilities — general features */}
          <Suspense fallback={<SectionLoader />}>
            <ErrorBoundary sectionName="Platform Capabilities">
              <PlatformCapabilitiesSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 7: CTA — mirrors hero */}
          <Suspense fallback={<SectionLoader height="300px" />}>
            <ErrorBoundary sectionName="CTA">
              <CtaPluginSection />
            </ErrorBoundary>
          </Suspense>
        </main>
        <Footer />
      </div>
    </MetricsProvider>
  );
}
