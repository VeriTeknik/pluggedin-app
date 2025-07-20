'use client';

import { useTranslation } from 'react-i18next';

import { Footer } from '@/components/footer';
import { LandingNavbar } from '@/components/landing-navbar';
import { LandingAiModelsSection } from '@/components/landing-sections/ai-models';
import { LandingCollectionManagement } from '@/components/landing-sections/collection-management';
import { LandingCommunitySharing } from '@/components/landing-sections/community-sharing';
import { LandingCta } from '@/components/landing-sections/cta';
import { LandingDevelopersSection } from '@/components/landing-sections/developers';
import { LandingFeaturesOverview } from '@/components/landing-sections/features-overview';
import { LandingGettingStartedSection } from '@/components/landing-sections/getting-started';
import { LandingHeroSection } from '@/components/landing-sections/hero';
import { LandingMcpPlayground } from '@/components/landing-sections/mcp-playground';
import { LandingPricingSection } from '@/components/landing-sections/pricing';
import { LandingSearchFunctionality } from '@/components/landing-sections/search-functionality';
import { LandingSecuritySection } from '@/components/landing-sections/security';
import { LandingWhyPluggedin } from '@/components/landing-sections/why-pluggedin';
//import { LandingTestimonials } from '@/components/landing-sections/testimonials';   // TODO: Add testimonials when we have them

export default function Home() {
  const { ready } = useTranslation(); // Keep ready check for i18n loading

  // Add a loading state while i18n is initializing
  if (!ready) {
     // Basic loading state, can be styled better
    return <div className="flex min-h-screen items-center justify-center">Loading translations...</div>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <LandingNavbar />
      <main className="flex-grow">
        <LandingHeroSection />
        <LandingWhyPluggedin />
        <LandingFeaturesOverview />
        <LandingAiModelsSection />
        <LandingPricingSection />
        <LandingCommunitySharing />
        <LandingCollectionManagement />
        <LandingSearchFunctionality />
        <LandingMcpPlayground />
        <LandingSecuritySection />
        <LandingDevelopersSection />
        <LandingGettingStartedSection />
        {/* <LandingTestimonials /> */}
        <LandingCta />
      </main>
      <Footer />
    </div>
  );
}
