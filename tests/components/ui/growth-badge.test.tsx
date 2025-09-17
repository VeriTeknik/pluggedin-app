import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GrowthBadge } from '@/components/ui/growth-badge';
import '@testing-library/jest-dom';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: vi.fn(({ children, className, ...props }) => (
      <div className={className} {...props}>{children}</div>
    )),
  },
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  TrendingUp: vi.fn(({ className }) => (
    <svg className={className} data-testid="trending-up-icon">TrendingUp</svg>
  )),
}));

describe('GrowthBadge', () => {
  it('renders value and label correctly', () => {
    render(<GrowthBadge value="718%" label="Monthly Growth" />);

    expect(screen.getByText('718%')).toBeInTheDocument();
    expect(screen.getByText('Monthly Growth')).toBeInTheDocument();
  });

  it('renders trending up icon', () => {
    render(<GrowthBadge value="500%" label="Growth" />);

    expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument();
  });

  it('applies default size classes', () => {
    const { container } = render(<GrowthBadge value="100%" label="Test" />);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('px-4', 'py-2', 'text-sm', 'gap-2');
  });

  it('applies small size classes', () => {
    const { container } = render(
      <GrowthBadge value="100%" label="Test" size="sm" />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('px-3', 'py-1.5', 'text-xs', 'gap-1.5');
  });

  it('applies large size classes', () => {
    const { container } = render(
      <GrowthBadge value="100%" label="Test" size="lg" />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('px-6', 'py-3', 'text-base', 'gap-3');
  });

  it('applies custom className', () => {
    const { container } = render(
      <GrowthBadge value="100%" label="Test" className="custom-class" />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('custom-class');
  });

  it('has gradient background classes', () => {
    const { container } = render(<GrowthBadge value="200%" label="Growth" />);

    const badge = container.firstChild as HTMLElement;
    // Check for gradient classes in the className string
    expect(badge.className).toContain('from-glow-green/20');
    expect(badge.className).toContain('via-electric-cyan/20');
    expect(badge.className).toContain('to-glow-green/20');
  });

  it('has border styling', () => {
    const { container } = render(<GrowthBadge value="300%" label="Increase" />);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('border', 'border-glow-green/40');
  });

  it('applies backdrop blur effect', () => {
    const { container } = render(<GrowthBadge value="400%" label="Boost" />);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('backdrop-blur-sm');
  });

  it('has animation classes', () => {
    const { container } = render(<GrowthBadge value="500%" label="Surge" />);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('animate-gradient-shift', 'bg-300%');
  });

  it('renders pulse overlay', () => {
    const { container } = render(<GrowthBadge value="600%" label="Spike" />);

    const overlay = container.querySelector('.absolute.inset-0');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass('bg-glow-green/10', 'blur-xl', 'animate-pulse');
  });

  it('applies correct icon size for small variant', () => {
    render(<GrowthBadge value="100%" label="Test" size="sm" />);

    const icon = screen.getByTestId('trending-up-icon');
    expect(icon).toHaveClass('w-3', 'h-3');
  });

  it('applies correct icon size for medium variant', () => {
    render(<GrowthBadge value="100%" label="Test" size="md" />);

    const icon = screen.getByTestId('trending-up-icon');
    expect(icon).toHaveClass('w-4', 'h-4');
  });

  it('applies correct icon size for large variant', () => {
    render(<GrowthBadge value="100%" label="Test" size="lg" />);

    const icon = screen.getByTestId('trending-up-icon');
    expect(icon).toHaveClass('w-5', 'h-5');
  });

  it('styles value text with bold and green color', () => {
    render(<GrowthBadge value="999%" label="Maximum" />);

    const value = screen.getByText('999%');
    expect(value).toHaveClass('font-bold', 'text-glow-green');
  });

  it('styles label text with muted color', () => {
    render(<GrowthBadge value="100%" label="Label Text" />);

    const label = screen.getByText('Label Text');
    expect(label).toHaveClass('text-foreground/80');
  });

  it('handles different value formats', () => {
    const { rerender } = render(<GrowthBadge value="+50" label="Users" />);
    expect(screen.getByText('+50')).toBeInTheDocument();

    rerender(<GrowthBadge value="1.2K" label="Downloads" />);
    expect(screen.getByText('1.2K')).toBeInTheDocument();

    rerender(<GrowthBadge value="↑ 25%" label="Improvement" />);
    expect(screen.getByText('↑ 25%')).toBeInTheDocument();
  });

  it('maintains inline-flex layout', () => {
    const { container } = render(<GrowthBadge value="100%" label="Test" />);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('inline-flex', 'items-center');
  });

  it('has rounded-full border radius', () => {
    const { container } = render(<GrowthBadge value="100%" label="Test" />);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('rounded-full');
  });
});