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

// Section 2: One-Liner (Personal / Collective / Archetypal)
const OneLinerSection = dynamicImport(
  () => import('@/components/landing-sections/one-liner').then(mod => ({ default: mod.OneLinerSection })),
  { loading: () => <SectionLoader />, ssr: true }
);

// Section 3: Terminal Demo (animated hook lifecycle)
const TerminalDemoSection = dynamicImport(
  () => import('@/components/landing-sections/terminal-demo').then(mod => ({ default: mod.TerminalDemoSection })),
  { loading: () => <SectionLoader height="600px" />, ssr: true }
);

// Section 4: Jungian Archetypes
const JungianIntelligenceSection = dynamicImport(
  () => import('@/components/landing-sections/jungian-intelligence').then(mod => ({ default: mod.JungianIntelligenceSection })),
  { loading: () => <SectionLoader />, ssr: true }
);

// Section 5: Dream Processing (token economics)
const DreamProcessingSection = dynamicImport(
  () => import('@/components/landing-sections/dream-processing').then(mod => ({ default: mod.DreamProcessingSection })),
  { loading: () => <SectionLoader height="500px" />, ssr: true }
);

// Section 6: Individuation Score
const IndividuationScoreSection = dynamicImport(
  () => import('@/components/landing-sections/individuation-score').then(mod => ({ default: mod.IndividuationScoreSection })),
  { loading: () => <SectionLoader height="500px" />, ssr: true }
);

// Section 7: Privacy
const PrivacySection = dynamicImport(
  () => import('@/components/landing-sections/privacy').then(mod => ({ default: mod.PrivacySection })),
  { loading: () => <SectionLoader />, ssr: true }
);

// Section 8: Platform Capabilities
const PlatformCapabilitiesSection = dynamicImport(
  () => import('@/components/landing-sections/platform-capabilities').then(mod => ({ default: mod.PlatformCapabilitiesSection })),
  { loading: () => <SectionLoader />, ssr: true }
);

// Section 9: CTA
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

          {/* Section 2: One-liner — Personal / Collective / Archetypal */}
          <Suspense fallback={<SectionLoader />}>
            <ErrorBoundary sectionName="One Liner">
              <OneLinerSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 3: Terminal Demo — animated hook lifecycle */}
          <Suspense fallback={<SectionLoader height="600px" />}>
            <ErrorBoundary sectionName="Terminal Demo">
              <TerminalDemoSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 4: Jungian Archetypes */}
          <Suspense fallback={<SectionLoader />}>
            <ErrorBoundary sectionName="Jungian Intelligence">
              <JungianIntelligenceSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 5: Dream Processing — token economics */}
          <Suspense fallback={<SectionLoader height="500px" />}>
            <ErrorBoundary sectionName="Dream Processing">
              <DreamProcessingSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 6: Individuation Score */}
          <Suspense fallback={<SectionLoader height="500px" />}>
            <ErrorBoundary sectionName="Individuation Score">
              <IndividuationScoreSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 7: Privacy */}
          <Suspense fallback={<SectionLoader />}>
            <ErrorBoundary sectionName="Privacy">
              <PrivacySection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 8: Platform Capabilities — general features */}
          <Suspense fallback={<SectionLoader />}>
            <ErrorBoundary sectionName="Platform Capabilities">
              <PlatformCapabilitiesSection />
            </ErrorBoundary>
          </Suspense>

          {/* Section 9: CTA — mirrors hero */}
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
