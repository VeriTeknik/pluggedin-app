import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustIndicatorsSection } from '@/components/landing-sections/trust-indicators';
import '@testing-library/jest-dom';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'trust.title': 'Enterprise Trust & Security',
        'trust.subtitle': 'Join thousands of organizations that trust Plugged.in',
        'trust.certifications.soc2.label': 'SOC 2 Type II',
        'trust.certifications.soc2.description': 'Certified',
        'trust.certifications.iso.label': 'ISO 27001',
        'trust.certifications.iso.description': 'Compliant',
        'trust.certifications.gdpr.label': 'GDPR',
        'trust.certifications.gdpr.description': 'Compliant',
        'trust.certifications.hipaa.label': 'HIPAA',
        'trust.certifications.hipaa.description': 'Ready',
        'trust.growth.title': 'From 0 to 14,000+ API calls in just 30 days',
        'trust.growth.subtitle': 'Join 620+ developers building the future',
        'trust.growth.stats.documents': '87+ AI Documents',
        'trust.growth.stats.servers': '460 Active Servers',
        'trust.growth.stats.projects': '650+ Projects Created',
      };
      return translations[key] || key;
    },
    i18n: {
      language: 'en',
    },
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: vi.fn(({ children, ...props }) => <div {...props}>{children}</div>),
    h2: vi.fn(({ children, ...props }) => <h2 {...props}>{children}</h2>),
    p: vi.fn(({ children, ...props }) => <p {...props}>{children}</p>),
    h3: vi.fn(({ children, ...props }) => <h3 {...props}>{children}</h3>),
  },
}));

// Mock react-intersection-observer
vi.mock('react-intersection-observer', () => ({
  useInView: vi.fn(() => ({
    ref: vi.fn(),
    inView: true,
  })),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Shield: vi.fn(({ className }) => <div className={className}>Shield Icon</div>),
  Lock: vi.fn(({ className }) => <div className={className}>Lock Icon</div>),
  Award: vi.fn(({ className }) => <div className={className}>Award Icon</div>),
  CheckCircle2: vi.fn(({ className }) => <div className={className}>Check Icon</div>),
  Star: vi.fn(({ className }) => <div className={className}>Star Icon</div>),
}));

describe('TrustIndicatorsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the section title and subtitle', () => {
    render(<TrustIndicatorsSection />);

    expect(screen.getByText('Enterprise Trust & Security')).toBeInTheDocument();
    expect(screen.getByText('Join thousands of organizations that trust Plugged.in')).toBeInTheDocument();
  });

  it('renders all certification badges', () => {
    render(<TrustIndicatorsSection />);

    // Check certification labels
    expect(screen.getByText('SOC 2 Type II')).toBeInTheDocument();
    expect(screen.getByText('ISO 27001')).toBeInTheDocument();
    expect(screen.getByText('GDPR')).toBeInTheDocument();
    expect(screen.getByText('HIPAA')).toBeInTheDocument();

    // Check certification descriptions
    expect(screen.getByText('Certified')).toBeInTheDocument();
    expect(screen.getAllByText('Compliant')).toHaveLength(2);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders certification icons', () => {
    render(<TrustIndicatorsSection />);

    expect(screen.getByText('Shield Icon')).toBeInTheDocument();
    expect(screen.getByText('Lock Icon')).toBeInTheDocument();
    expect(screen.getByText('Award Icon')).toBeInTheDocument();
    expect(screen.getByText('Check Icon')).toBeInTheDocument();
  });

  it('renders growth story section', () => {
    render(<TrustIndicatorsSection />);

    expect(screen.getByText('From 0 to 14,000+ API calls in just 30 days')).toBeInTheDocument();
    expect(screen.getByText('Join 620+ developers building the future')).toBeInTheDocument();
  });

  it('renders growth statistics', () => {
    render(<TrustIndicatorsSection />);

    expect(screen.getByText('87+ AI Documents')).toBeInTheDocument();
    expect(screen.getByText('460 Active Servers')).toBeInTheDocument();
    expect(screen.getByText('650+ Projects Created')).toBeInTheDocument();
  });

  it('applies correct gradient classes for styling', () => {
    render(<TrustIndicatorsSection />);

    const title = screen.getByText('Enterprise Trust & Security');
    expect(title).toHaveClass('text-transparent', 'bg-clip-text', 'bg-gradient-to-r');
  });

  it('uses motion components for animations', async () => {
    const { motion } = await import('framer-motion');
    render(<TrustIndicatorsSection />);

    // Verify motion components are used
    expect(motion.div).toHaveBeenCalled();
    expect(motion.h2).toHaveBeenCalled();
    expect(motion.p).toHaveBeenCalled();
  });

  it('triggers animations when in view', async () => {
    const { useInView } = await import('react-intersection-observer');

    // Test not in view
    (useInView as any).mockReturnValueOnce({
      ref: vi.fn(),
      inView: false,
    });

    const { rerender } = render(<TrustIndicatorsSection />);

    // Test scrolling into view
    (useInView as any).mockReturnValueOnce({
      ref: vi.fn(),
      inView: true,
    });

    rerender(<TrustIndicatorsSection />);

    // Verify component re-renders with inView state
    expect(useInView).toHaveBeenCalledWith({
      threshold: 0.1,
      triggerOnce: true,
    });
  });

  it('renders certification cards with hover effects', () => {
    render(<TrustIndicatorsSection />);

    const cards = document.querySelectorAll('.group');

    // Should have 4 certification cards
    const certCards = Array.from(cards).filter(card =>
      card.textContent?.includes('SOC 2') ||
      card.textContent?.includes('ISO') ||
      card.textContent?.includes('GDPR') ||
      card.textContent?.includes('HIPAA')
    );

    expect(certCards).toHaveLength(4);

    // Check for hover classes
    certCards.forEach(card => {
      expect(card).toHaveClass('group');
      expect(card.querySelector('.group-hover\\:scale-110')).toBeTruthy();
    });
  });

  it('renders growth chart visualization', () => {
    render(<TrustIndicatorsSection />);

    // Check for chart bars
    const chartBars = document.querySelectorAll('.bg-gradient-to-t');
    expect(chartBars.length).toBeGreaterThan(0);
  });

  it('renders star ratings in growth stats', () => {
    render(<TrustIndicatorsSection />);

    // Multiple star icons should be present for ratings
    const starIcons = screen.getAllByText('Star Icon');
    expect(starIcons.length).toBeGreaterThan(0);
  });

  it('applies responsive grid layout', () => {
    render(<TrustIndicatorsSection />);

    // Check for responsive grid classes
    const grids = document.querySelectorAll('.grid');

    grids.forEach(grid => {
      const classList = Array.from(grid.classList);
      const hasResponsiveGrid =
        classList.includes('md:grid-cols-4') ||
        classList.includes('md:grid-cols-3') ||
        classList.includes('grid-cols-2');

      expect(hasResponsiveGrid).toBeTruthy();
    });
  });

  it('renders with proper section padding and spacing', () => {
    render(<TrustIndicatorsSection />);

    const section = document.querySelector('section');
    expect(section).toHaveClass('py-16', 'md:py-24');
  });

  it('renders growth timeline dots', () => {
    render(<TrustIndicatorsSection />);

    // Should have timeline dots for each stat
    const timelineDots = document.querySelectorAll('.absolute.w-3.h-3');
    expect(timelineDots.length).toBeGreaterThan(0);
  });
});