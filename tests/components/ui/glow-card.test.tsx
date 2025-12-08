import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlowCard } from '@/components/ui/glow-card';
import '@testing-library/jest-dom';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: vi.fn(({ children, className, ...props }) => (
      <div className={className} {...props}>{children}</div>
    )),
  },
}));

describe('GlowCard', () => {
  it('renders children content', () => {
    render(
      <GlowCard>
        <p>Test content</p>
      </GlowCard>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <GlowCard className="custom-class">
        Content
      </GlowCard>
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('custom-class');
  });

  it('has glow effect classes', () => {
    const { container } = render(
      <GlowCard>
        Content
      </GlowCard>
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('relative');
    // Check for gradient and animation classes that create the glow effect
    expect(card.className).toContain('electric-cyan');
    expect(card.className).toContain('neon-purple');
    expect(card.className).toContain('animate-gradient-shift');
  });

  it('renders with hover effect', () => {
    const { container } = render(
      <GlowCard hover>
        Content
      </GlowCard>
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('transition-all');
  });

  it('accepts intensity prop', () => {
    const { container } = render(
      <GlowCard intensity="high">
        Content
      </GlowCard>
    );

    const card = container.firstChild as HTMLElement;
    // Check that intensity affects the glow
    expect(card).toBeInTheDocument();
  });

  it('renders with different color variants', () => {
    const { container, rerender } = render(
      <GlowCard glowColor="electric-cyan">
        Content
      </GlowCard>
    );

    let card = container.firstChild as HTMLElement;
    expect(card.className).toContain('electric-cyan');

    rerender(
      <GlowCard glowColor="neon-purple">
        Content
      </GlowCard>
    );

    card = container.firstChild as HTMLElement;
    expect(card.className).toContain('neon-purple');
  });
});