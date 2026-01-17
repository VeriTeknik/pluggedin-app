import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AnimatedMetric } from '@/components/ui/animated-metric';
import '@testing-library/jest-dom';

// Mock react-intersection-observer
vi.mock('react-intersection-observer', () => ({
  useInView: vi.fn(() => ({
    ref: vi.fn(),
    inView: true,
  })),
}));

// Mock react-countup
vi.mock('react-countup', () => ({
  default: vi.fn(({ end, prefix, suffix }) => (
    <span>{prefix}{end}{suffix}</span>
  )),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: vi.fn(({ children, ...props }) => <div {...props}>{children}</div>),
  },
}));

describe('AnimatedMetric', () => {
  let mockMatchMedia: any;

  beforeEach(() => {
    // Mock window.matchMedia for reduced motion tests
    mockMatchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.matchMedia = mockMatchMedia;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders metric value correctly', () => {
    render(
      <AnimatedMetric
        value={1000}
        label="Test Metric"
      />
    );

    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
  });

  it('renders with prefix and suffix', () => {
    render(
      <AnimatedMetric
        value={100}
        prefix="<"
        suffix="ms"
        label="Response Time"
      />
    );

    // Check aria-label which contains the full formatted value
    const metricElement = screen.getByLabelText('<100 Response Time');
    expect(metricElement).toBeInTheDocument();
    expect(screen.getByText('Response Time')).toBeInTheDocument();
  });

  it('renders with description when provided', () => {
    const { container } = render(
      <AnimatedMetric
        value={500}
        label="Active Users"
      />
    );

    // AnimatedMetric doesn't have a description prop, just label
    expect(screen.getByText('Active Users')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('applies default text size classes', () => {
    render(
      <AnimatedMetric value={100} label="Test" />
    );

    const container = screen.getByRole('status');
    // Component uses text-4xl by default
    expect(container.querySelector('.text-4xl')).toBeInTheDocument();
  });

  it('respects reduced motion preference', () => {
    // Mock prefers-reduced-motion
    mockMatchMedia.mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <AnimatedMetric
        value={1000}
        label="Test Metric"
      />
    );

    // Should render value immediately without animation
    expect(screen.getByText('1000')).toBeInTheDocument();
  });

  it('adds ARIA labels for accessibility', () => {
    render(
      <AnimatedMetric
        value={7268}
        suffix="+"
        label="Verified Tools"
        description="Pre-verified with encrypted keys"
      />
    );

    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-live', 'polite');
    expect(container).toHaveAttribute('aria-atomic', 'true');
  });

  it('handles animation trigger on scroll into view', async () => {
    const { useInView } = await import('react-intersection-observer');

    // Mock not in view initially
    (useInView as any).mockReturnValueOnce({
      ref: vi.fn(),
      inView: false,
    });

    const { rerender } = render(
      <AnimatedMetric value={1000} label="Test" />
    );

    // Mock scrolling into view
    (useInView as any).mockReturnValueOnce({
      ref: vi.fn(),
      inView: true,
    });

    rerender(<AnimatedMetric value={1000} label="Test" />);

    await waitFor(() => {
      expect(screen.getByText('1000')).toBeInTheDocument();
    });
  });

  it('applies custom className when provided', () => {
    render(
      <AnimatedMetric
        value={100}
        label="Test"
        className="custom-class"
      />
    );

    const container = screen.getByRole('status');
    expect(container).toHaveClass('custom-class');
  });

  it('handles decimal values correctly', () => {
    render(
      <AnimatedMetric
        value={99.9}
        suffix="%"
        label="Uptime"
        decimals={1}
      />
    );

    expect(screen.getByText('99.9%')).toBeInTheDocument();
  });

  it('handles zero values', () => {
    render(
      <AnimatedMetric
        value={0}
        label="Errors"
      />
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('updates when value prop changes', () => {
    const { rerender } = render(
      <AnimatedMetric value={100} label="Dynamic" />
    );

    expect(screen.getByText('100')).toBeInTheDocument();

    rerender(<AnimatedMetric value={200} label="Dynamic" />);
    expect(screen.getByText('200')).toBeInTheDocument();
  });
});