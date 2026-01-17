import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingHeroEnterpriseSection } from '@/components/landing-sections/hero-enterprise';
import '@testing-library/jest-dom';

// Mock next/link
vi.mock('next/link', () => ({
  default: vi.fn(({ children, href }) => (
    <a href={href}>{children}</a>
  )),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'hero.headline': 'Enterprise MCP Platform',
        'hero.subheadline': 'Secure, scalable, and blazing fast',
        'hero.cta.getStarted': 'Get Started',
        'hero.cta.learnMore': 'Learn More',
        'metrics.growth.label': 'Monthly Growth',
      };
      return translations[key] || key;
    },
    ready: true,
    i18n: { language: 'en' },
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: vi.fn(({ children, ...props }) => <div {...props}>{children}</div>),
    h1: vi.fn(({ children, ...props }) => <h1 {...props}>{children}</h1>),
    p: vi.fn(({ children, ...props }) => <p {...props}>{children}</p>),
  },
}));

// Mock react-intersection-observer
vi.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

// Mock hooks
vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => true,
}));

// Mock components
vi.mock('@/components/ui/glow-card', () => ({
  GlowCard: vi.fn(({ children, className }) => (
    <div className={`glow-card ${className || ''}`}>{children}</div>
  )),
}));

vi.mock('@/components/ui/animated-metric', () => ({
  AnimatedMetric: vi.fn(({ value, label, suffix, prefix }) => (
    <div className="animated-metric">
      {prefix}{value}{suffix} - {label}
    </div>
  )),
}));

vi.mock('@/components/ui/growth-badge', () => ({
  GrowthBadge: vi.fn(({ value, label }) => (
    <div className="growth-badge">{value} {label}</div>
  )),
}));

vi.mock('./particle-background', () => ({
  ParticleBackground: vi.fn(() => <div className="particle-background" />),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowRight: vi.fn(() => <span>→</span>),
  Shield: vi.fn(({ className }) => <svg className={className}>Shield</svg>),
  Zap: vi.fn(({ className }) => <svg className={className}>Zap</svg>),
  Globe: vi.fn(({ className }) => <svg className={className}>Globe</svg>),
  CheckCircle: vi.fn(() => <svg>Check</svg>),
  BookOpen: vi.fn(({ className }) => <svg className={className}>BookOpen</svg>),
  Bot: vi.fn(({ className }) => <svg className={className}>Bot</svg>),
  Database: vi.fn(({ className }) => <svg className={className}>Database</svg>),
  Wrench: vi.fn(({ className }) => <svg className={className}>Wrench</svg>),
}));

describe('LandingHeroEnterpriseSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the hero headline', () => {
    render(<LandingHeroEnterpriseSection />);
    expect(screen.getByText('Enterprise MCP Platform')).toBeInTheDocument();
  });

  it('renders the subheadline', () => {
    render(<LandingHeroEnterpriseSection />);
    expect(screen.getByText('Secure, scalable, and blazing fast')).toBeInTheDocument();
  });

  it('renders growth badge with correct value', () => {
    render(<LandingHeroEnterpriseSection />);
    expect(screen.getByText('718% Monthly Growth')).toBeInTheDocument();
  });

  it('renders CTA buttons', () => {
    render(<LandingHeroEnterpriseSection />);
    expect(screen.getByText('Get Started')).toBeInTheDocument();
    expect(screen.getByText('Learn More')).toBeInTheDocument();
  });

  it('renders correct CTA links', () => {
    render(<LandingHeroEnterpriseSection />);

    const getStartedLink = screen.getByText('Get Started').closest('a');
    expect(getStartedLink).toHaveAttribute('href', '/login');

    const learnMoreLink = screen.getByText('Learn More').closest('a');
    expect(learnMoreLink).toHaveAttribute('href', '/search');
  });

  it('renders feature badges', () => {
    render(<LandingHeroEnterpriseSection />);

    expect(screen.getByText('Enterprise Security')).toBeInTheDocument();
    expect(screen.getByText('Lightning Fast')).toBeInTheDocument();
    expect(screen.getByText('Global Scale')).toBeInTheDocument();
  });

  it('renders feature icons', () => {
    render(<LandingHeroEnterpriseSection />);

    expect(screen.getByText('Shield')).toBeInTheDocument();
    expect(screen.getByText('Zap')).toBeInTheDocument();
    expect(screen.getByText('Globe')).toBeInTheDocument();
  });

  it('renders metric cards', () => {
    render(<LandingHeroEnterpriseSection />);

    const metricCards = document.querySelectorAll('.glow-card');
    expect(metricCards).toHaveLength(4); // 4 metrics displayed
  });

  it('renders particle background', () => {
    render(<LandingHeroEnterpriseSection />);

    expect(document.querySelector('.particle-background')).toBeInTheDocument();
  });

  it('renders bottom stats bar', () => {
    render(<LandingHeroEnterpriseSection />);

    // Check for developer count
    expect(screen.getByText(/620\+/)).toBeInTheDocument();
    expect(screen.getByText('Active Developers')).toBeInTheDocument();

    // Check for project count
    expect(screen.getByText(/650\+/)).toBeInTheDocument();
    expect(screen.getByText('Active Projects')).toBeInTheDocument();

    // Check for active servers
    expect(screen.getByText(/460/)).toBeInTheDocument();
    expect(screen.getByText('Active Servers')).toBeInTheDocument();
  });

  it('applies gradient text styling to headline', () => {
    render(<LandingHeroEnterpriseSection />);

    const headline = screen.getByText('Enterprise MCP Platform');
    expect(headline).toHaveClass('text-transparent', 'bg-clip-text', 'bg-gradient-to-r');
  });

  it('renders grid pattern overlay', () => {
    render(<LandingHeroEnterpriseSection />);

    const gridPattern = document.querySelector('.bg-\\[linear-gradient\\(to_right\\,#80808012_1px\\,transparent_1px\\)\\,linear-gradient\\(to_bottom\\,#80808012_1px\\,transparent_1px\\)\\]');
    expect(gridPattern).toBeInTheDocument();
  });

  it('renders gradient overlay', () => {
    render(<LandingHeroEnterpriseSection />);

    const gradientOverlay = document.querySelector('.bg-gradient-to-t.from-background\\/80');
    expect(gradientOverlay).toBeInTheDocument();
  });

  it('applies correct section classes', () => {
    render(<LandingHeroEnterpriseSection />);

    const section = document.querySelector('section');
    expect(section).toHaveClass('relative', 'min-h-screen', 'flex', 'items-center', 'overflow-hidden');
  });

  it('renders central shield badge', () => {
    render(<LandingHeroEnterpriseSection />);

    const shieldBadge = document.querySelector('.absolute.top-1\\/2.left-1\\/2');
    expect(shieldBadge).toBeInTheDocument();

    // Check for shield icon
    const shieldIcon = shieldBadge?.querySelector('.w-12.h-12');
    expect(shieldIcon).toBeInTheDocument();
  });

  it('does not render when not mounted', () => {
    vi.doMock('@/hooks/use-mounted', () => ({
      useMounted: () => false,
    }));

    const { container } = render(<LandingHeroEnterpriseSection />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render when translations not ready', () => {
    vi.doMock('react-i18next', () => ({
      useTranslation: () => ({
        t: vi.fn(),
        ready: false,
        i18n: { language: 'en' },
      }),
    }));

    const { container } = render(<LandingHeroEnterpriseSection />);
    expect(container.firstChild).toBeNull();
  });

  it('applies responsive grid layout', () => {
    render(<LandingHeroEnterpriseSection />);

    const grid = document.querySelector('.grid.lg\\:grid-cols-2');
    expect(grid).toBeInTheDocument();
  });

  it('renders separator lines in stats bar', () => {
    render(<LandingHeroEnterpriseSection />);

    const separators = document.querySelectorAll('.w-px.h-8.bg-border\\/50');
    expect(separators.length).toBeGreaterThan(0);
  });

  it('applies hover animation classes to metric cards', () => {
    render(<LandingHeroEnterpriseSection />);

    const glowCards = document.querySelectorAll('.hover\\:animate-pulse-glow');
    expect(glowCards.length).toBeGreaterThan(0);
  });

  it('renders with proper z-index layering', () => {
    render(<LandingHeroEnterpriseSection />);

    const contentContainer = document.querySelector('.container.relative.z-10');
    expect(contentContainer).toBeInTheDocument();
  });
});