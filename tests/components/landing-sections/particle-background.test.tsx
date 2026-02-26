import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ParticleBackground } from '@/components/landing-sections/particle-background';
import '@testing-library/jest-dom';

// Mock window properties
const mockMatchMedia = vi.fn();
const mockRequestAnimationFrame = vi.fn();
const mockCancelAnimationFrame = vi.fn();

describe('ParticleBackground', () => {
  let originalMatchMedia: any;
  let originalRequestAnimationFrame: any;
  let originalCancelAnimationFrame: any;
  let originalDevicePixelRatio: any;

  beforeEach(() => {
    // Save originals
    originalMatchMedia = window.matchMedia;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalDevicePixelRatio = window.devicePixelRatio;

    // Setup mocks
    window.matchMedia = mockMatchMedia;
    window.requestAnimationFrame = mockRequestAnimationFrame;
    window.cancelAnimationFrame = mockCancelAnimationFrame;
    window.devicePixelRatio = 2; // High DPI screen

    // Default matchMedia response
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // Mock requestAnimationFrame - don't run callback immediately to avoid infinite loops
    let rafId = 0;
    mockRequestAnimationFrame.mockImplementation((callback: FrameRequestCallback) => {
      // Schedule callback for next tick instead of running immediately
      setTimeout(() => callback(16), 0);
      return ++rafId;
    });

    mockCancelAnimationFrame.mockImplementation(() => {});

    // Mock canvas context
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    });
  });

  afterEach(() => {
    // Restore originals
    window.matchMedia = originalMatchMedia;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    window.devicePixelRatio = originalDevicePixelRatio;
    vi.clearAllMocks();
  });

  it('renders canvas element', () => {
    const { container } = render(<ParticleBackground />);

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('applies correct classes to canvas', () => {
    const { container } = render(<ParticleBackground />);

    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveClass('absolute', 'inset-0', 'z-0', 'opacity-50');
  });

  it('sets aria-hidden for accessibility', () => {
    const { container } = render(<ParticleBackground />);

    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('respects reduced motion preference', () => {
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<ParticleBackground />);

    // Should not call requestAnimationFrame when reduced motion is preferred
    expect(mockRequestAnimationFrame).not.toHaveBeenCalled();
  });

  it('starts animation when reduced motion is not preferred', () => {
    render(<ParticleBackground />);

    // Should call requestAnimationFrame to start animation
    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });

  it('sets canvas size based on window dimensions', () => {
    const { container } = render(<ParticleBackground />);

    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');

    expect(ctx?.scale).toHaveBeenCalledWith(2, 2); // Device pixel ratio of 2
  });

  it('handles resize events', async () => {
    const { container } = render(<ParticleBackground />);

    // Trigger resize event
    window.dispatchEvent(new Event('resize'));

    await waitFor(() => {
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });
  });

  it('cleans up animation frame on unmount', () => {
    const { unmount } = render(<ParticleBackground />);

    unmount();

    expect(mockCancelAnimationFrame).toHaveBeenCalled();
  });

  it('removes event listeners on unmount', () => {
    const removeEventListenerSpy = vi.fn();
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: removeEventListenerSpy,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { unmount } = render(<ParticleBackground />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalled();
  });

  it('applies will-change style when motion is enabled', () => {
    const { container } = render(<ParticleBackground />);

    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveStyle({ willChange: 'transform' });
  });

  it('applies will-change auto when reduced motion is preferred', () => {
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(<ParticleBackground />);

    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveStyle({ willChange: 'auto' });
  });

  it('handles media query changes', async () => {
    let changeHandler: ((event: any) => void) | null = null;

    mockMatchMedia.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (event: string, handler: (event: any) => void) => {
        if (event === 'change') {
          changeHandler = handler;
        }
      },
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<ParticleBackground />);

    // Simulate media query change
    if (changeHandler) {
      changeHandler({ matches: true });
    }

    await waitFor(() => {
      expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });
  });

  it('creates 2D context with alpha transparency', () => {
    render(<ParticleBackground />);

    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d', { alpha: true });
  });

  it('draws particles on canvas', () => {
    render(<ParticleBackground />);

    const canvas = document.querySelector('canvas');
    const ctx = canvas?.getContext('2d');

    // Check that drawing methods are called
    expect(ctx?.clearRect).toHaveBeenCalled();
    expect(ctx?.beginPath).toHaveBeenCalled();
    expect(ctx?.arc).toHaveBeenCalled();
    expect(ctx?.fill).toHaveBeenCalled();
  });

  it('draws connections between nearby particles', () => {
    render(<ParticleBackground />);

    const canvas = document.querySelector('canvas');
    const ctx = canvas?.getContext('2d');

    // Check that line drawing methods are called for connections
    expect(ctx?.moveTo).toHaveBeenCalled();
    expect(ctx?.lineTo).toHaveBeenCalled();
    expect(ctx?.stroke).toHaveBeenCalled();
  });

  it('uses optimized frame rate (30 FPS)', () => {
    const callbacks: FrameRequestCallback[] = [];
    mockRequestAnimationFrame.mockImplementation((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });

    render(<ParticleBackground />);

    // Simulate multiple frame updates
    callbacks[0]?.(0);
    callbacks[0]?.(16); // Less than frame interval (33ms for 30fps)
    callbacks[0]?.(33); // Should trigger update

    const canvas = document.querySelector('canvas');
    const ctx = canvas?.getContext('2d');

    // clearRect should be called on frame updates that meet the interval
    expect(ctx?.clearRect).toHaveBeenCalled();
  });

  it('handles missing canvas gracefully', () => {
    // Temporarily override to return null
    const originalQuerySelector = document.querySelector;
    document.querySelector = vi.fn().mockReturnValue(null);

    expect(() => render(<ParticleBackground />)).not.toThrow();

    document.querySelector = originalQuerySelector;
  });

  it('handles missing canvas context gracefully', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);

    expect(() => render(<ParticleBackground />)).not.toThrow();
    expect(mockRequestAnimationFrame).not.toHaveBeenCalled();
  });

  it('sets transparent background style', () => {
    const { container } = render(<ParticleBackground />);

    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveStyle({ background: 'transparent' });
  });
});