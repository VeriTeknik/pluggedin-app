'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { Footer } from '@/components/footer';
import { LandingNavbar } from '@/components/landing-navbar';
// Critical above-the-fold components loaded immediately
import { LandingHeroEnterpriseSection } from '@/components/landing-sections/hero-enterprise';
import { TrustIndicatorsSection } from '@/components/landing-sections/trust-indicators';
import { ErrorBoundary } from '@/components/ui/error-boundary';

// Loading skeleton component
const SectionLoader = ({ height = '400px' }: { height?: string }) => (
  <div className={`flex items-center justify-center`} style={{ minHeight: height }}>
    <div className="animate-pulse">
      <div className="h-8 w-48 bg-muted rounded mb-4 mx-auto" />
      <div className="h-4 w-32 bg-muted rounded mx-auto" />
    </div>
  </div>
);

// New v3 sections
const ProblemStatementSection = dynamic(
  () => import('@/components/landing-sections/problem-statement').then(mod => ({ default: mod.ProblemStatementSection })),
  {
    loading: () => <SectionLoader />,
    ssr: true
  }
);

const FourPillarsSection = dynamic(
  () => import('@/components/landing-sections/four-pillars').then(mod => ({ default: mod.FourPillarsSection })),
  {
    loading: () => <SectionLoader height="800px" />,
    ssr: true
  }
);

const VideoTutorialsSection = dynamic(
  () => import('@/components/landing-sections/video-tutorials').then(mod => ({ default: mod.VideoTutorialsSection })),
  {
    loading: () => <SectionLoader height="600px" />,
    ssr: true
  }
);

const RoadmapSection = dynamic(
  () => import('@/components/landing-sections/roadmap').then(mod => ({ default: mod.RoadmapSection })),
  {
    loading: () => <SectionLoader height="800px" />,
    ssr: true
  }
);

const PopularServersSection = dynamic(
  () => import('@/components/landing-sections/popular-servers').then(mod => ({ default: mod.PopularServersSection })),
  {
    loading: () => <SectionLoader height="600px" />,
    ssr: true
  }
);

// Dynamically imported sections with code splitting
const LandingOpenSourceSection = dynamic(
  () => import('@/components/landing-sections/opensource').then(mod => ({ default: mod.LandingOpenSourceSection })),
  {
    loading: () => <SectionLoader />,
    ssr: true
  }
);

const LandingWhyPluggedin = dynamic(
  () => import('@/components/landing-sections/why-pluggedin').then(mod => ({ default: mod.LandingWhyPluggedin })),
  {
    loading: () => <SectionLoader />,
    ssr: true
  }
);

const LandingFeaturesOverview = dynamic(
  () => import('@/components/landing-sections/features-overview').then(mod => ({ default: mod.LandingFeaturesOverview })),
  {
    loading: () => <SectionLoader />,
    ssr: true
  }
);

const LandingAiModelsSection = dynamic(
  () => import('@/components/landing-sections/ai-models').then(mod => ({ default: mod.LandingAiModelsSection })),
  {
    loading: () => <SectionLoader height="500px" />,
    ssr: true
  }
);

const LandingPricingSection = dynamic(
  () => import('@/components/landing-sections/pricing').then(mod => ({ default: mod.LandingPricingSection })),
  {
    loading: () => <SectionLoader height="600px" />,
    ssr: true
  }
);

const LandingCollectionManagement = dynamic(
  () => import('@/components/landing-sections/collection-management').then(mod => ({ default: mod.LandingCollectionManagement })),
  {
    loading: () => <SectionLoader />,
    ssr: false
  }
);

const LandingSearchFunctionality = dynamic(
  () => import('@/components/landing-sections/search-functionality').then(mod => ({ default: mod.LandingSearchFunctionality })),
  {
    loading: () => <SectionLoader />,
    ssr: false
  }
);

const LandingMcpPlayground = dynamic(
  () => import('@/components/landing-sections/mcp-playground').then(mod => ({ default: mod.LandingMcpPlayground })),
  {
    loading: () => <SectionLoader height="500px" />,
    ssr: false
  }
);

const LandingSecuritySection = dynamic(
  () => import('@/components/landing-sections/security').then(mod => ({ default: mod.LandingSecuritySection })),
  {
    loading: () => <SectionLoader />,
    ssr: true
  }
);

const LandingDevelopersSection = dynamic(
  () => import('@/components/landing-sections/developers').then(mod => ({ default: mod.LandingDevelopersSection })),
  {
    loading: () => <SectionLoader />,
    ssr: true
  }
);

const LandingGettingStartedSection = dynamic(
  () => import('@/components/landing-sections/getting-started').then(mod => ({ default: mod.LandingGettingStartedSection })),
  {
    loading: () => <SectionLoader />,
    ssr: true
  }
);

const LandingCta = dynamic(
  () => import('@/components/landing-sections/cta').then(mod => ({ default: mod.LandingCta })),
  {
    loading: () => <SectionLoader height="200px" />,
    ssr: true
  }
);

// const LandingTestimonials = dynamic(
//   () => import('@/components/landing-sections/testimonials').then(mod => ({ default: mod.LandingTestimonials })),
//   { loading: () => <SectionLoader /> }
// );

export default function Home() {
  const { ready } = useTranslation();

  // Loading state while i18n is initializing
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading translations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <LandingNavbar />
      <main className="flex-grow">
        {/* Critical above-the-fold content */}
        <ErrorBoundary sectionName="Hero">
          <LandingHeroEnterpriseSection />
        </ErrorBoundary>

        <ErrorBoundary sectionName="Trust Indicators">
          <TrustIndicatorsSection />
        </ErrorBoundary>

        {/* Popular Servers Section */}
        <Suspense fallback={<SectionLoader height="600px" />}>
          <ErrorBoundary sectionName="Popular Servers">
            <PopularServersSection />
          </ErrorBoundary>
        </Suspense>

        {/* New v3 sections */}
        <Suspense fallback={<SectionLoader />}>
          <ErrorBoundary sectionName="Problem Statement">
            <ProblemStatementSection />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<SectionLoader height="800px" />}>
          <ErrorBoundary sectionName="Four Pillars">
            <FourPillarsSection />
          </ErrorBoundary>
        </Suspense>

        {/* Video Tutorials Section */}
        <Suspense fallback={<SectionLoader height="600px" />}>
          <ErrorBoundary sectionName="Video Tutorials">
            <VideoTutorialsSection />
          </ErrorBoundary>
        </Suspense>

        {/* Roadmap Section */}
        <Suspense fallback={<SectionLoader height="800px" />}>
          <ErrorBoundary sectionName="Roadmap">
            <RoadmapSection />
          </ErrorBoundary>
        </Suspense>

        {/* Open Source Section */}
        <Suspense fallback={<SectionLoader />}>
          <ErrorBoundary sectionName="Open Source">
            <LandingOpenSourceSection />
          </ErrorBoundary>
        </Suspense>

        {/* Progressively loaded sections */}
        <Suspense fallback={<SectionLoader />}>
          <ErrorBoundary sectionName="Features">
            <LandingFeaturesOverview />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<SectionLoader height="500px" />}>
          <ErrorBoundary sectionName="AI Models">
            <LandingAiModelsSection />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<SectionLoader height="600px" />}>
          <ErrorBoundary sectionName="Pricing">
            <LandingPricingSection />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <ErrorBoundary sectionName="Collections">
            <LandingCollectionManagement />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <ErrorBoundary sectionName="Search">
            <LandingSearchFunctionality />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<SectionLoader height="500px" />}>
          <ErrorBoundary sectionName="Playground">
            <LandingMcpPlayground />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <ErrorBoundary sectionName="Security">
            <LandingSecuritySection />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <ErrorBoundary sectionName="Developers">
            <LandingDevelopersSection />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<SectionLoader />}>
          <ErrorBoundary sectionName="Getting Started">
            <LandingGettingStartedSection />
          </ErrorBoundary>
        </Suspense>

        {/* <Suspense fallback={<SectionLoader />}>
          <ErrorBoundary sectionName="Testimonials">
            <LandingTestimonials />
          </ErrorBoundary>
        </Suspense> */}

        <Suspense fallback={<SectionLoader height="200px" />}>
          <ErrorBoundary sectionName="CTA">
            <LandingCta />
          </ErrorBoundary>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}