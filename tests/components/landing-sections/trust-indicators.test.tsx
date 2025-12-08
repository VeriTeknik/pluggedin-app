import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustIndicatorsSection } from '@/components/landing-sections/trust-indicators';
import '@testing-library/jest-dom';

// Mock useMetrics hook
vi.mock('@/contexts/metrics-context', () => ({
  useMetrics: () => ({
    metrics: {
      totalUsers: 1000,
      totalProjects: 500,
      totalServers: 460,
      totalRegistryServers: 100,
      newProfiles30d: 50,
      newUsers30d: 30,
    },
    isLoading: false,
    hasError: false,
    refetch: vi.fn(),
  }),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'trust.title': 'Enterprise Trust & Security',
        'trust.subtitle': 'Join thousands of organizations that trust Plugged.in',
        'trust.certifications.soc2.label': 'SOC 2 Type II',
        'trust.certifications.soc2.description': 'Certified',
        'trust.certifications.pciDss.label': 'PCI DSS',
        'trust.certifications.pciDss.description': 'Compliant',
        'trust.certifications.gdpr.label': 'GDPR',
        'trust.certifications.gdpr.description': 'Compliant',
        'trust.certifications.hipaa.label': 'HIPAA',
        'trust.certifications.hipaa.description': 'Ready',
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
}));

// Mock AnimatedMetric component
vi.mock('@/components/ui/animated-metric', () => ({
  AnimatedMetric: vi.fn(({ value, suffix, label }) => (
    <div data-testid="animated-metric">
      <div>{value}{suffix}</div>
      <div>{label}</div>
    </div>
  )),
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
    expect(screen.getByText('PCI DSS')).toBeInTheDocument();
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

  it('renders stats grid with metrics', () => {
    render(<TrustIndicatorsSection />);

    // Check stat labels are rendered
    expect(screen.getByText('Monthly Growth')).toBeInTheDocument();
    expect(screen.getByText('Verified Tools')).toBeInTheDocument();
    expect(screen.getByText('MCP Servers')).toBeInTheDocument();
    expect(screen.getByText('Active Developers')).toBeInTheDocument();
  });

  it('applies correct gradient classes for styling', () => {
    render(<TrustIndicatorsSection />);

    const title = screen.getByText('Enterprise Trust & Security');
    expect(title).toHaveClass('text-transparent', 'bg-clip-text', 'bg-gradient-to-r');
  });

  it('uses motion components for animations', async () => {
    const { motion } = await import('framer-motion');
    render(<TrustIndicatorsSection />);

    // Verify motion.div is used for animations
    expect(motion.div).toHaveBeenCalled();
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
      card.textContent?.includes('PCI DSS') ||
      card.textContent?.includes('GDPR') ||
      card.textContent?.includes('HIPAA')
    );

    expect(certCards).toHaveLength(4);

    // Check for group class (enables hover effects)
    certCards.forEach(card => {
      expect(card).toHaveClass('group');
    });
  });

  it('renders background gradient', () => {
    render(<TrustIndicatorsSection />);

    // Check for background gradient
    const gradientBg = document.querySelector('.bg-gradient-to-b');
    expect(gradientBg).toBeInTheDocument();
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
    expect(section).toHaveClass('py-20');
  });
});