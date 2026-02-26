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

  it('has gradient effect classes', () => {
    const { container } = render(
      <GlowCard>
        Content
      </GlowCard>
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('relative');
    expect(card).toHaveClass('group');
    expect(card).toHaveClass('rounded-xl');
    expect(card.className).toContain('gradient');
  });

  it('renders with hover effect', () => {
    const { container } = render(
      <GlowCard>
        Content
      </GlowCard>
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('transition-all');
    expect(card).toHaveClass('duration-300');
  });

  it('has animation classes', () => {
    const { container } = render(
      <GlowCard>
        Content
      </GlowCard>
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('animate-gradient-shift');
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