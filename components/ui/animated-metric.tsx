'use client';

import { useEffect, useState } from 'react';
import CountUp from 'react-countup';
import { useInView } from 'react-intersection-observer';

import { cn } from '@/lib/utils';

interface AnimatedMetricProps {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  decimals?: number;
  className?: string;
  duration?: number;
}

export function AnimatedMetric({
  value,
  suffix = '',
  prefix = '',
  label,
  decimals = 0,
  className,
  duration = 2.5
}: AnimatedMetricProps) {
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true,
  });

  // Check for reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const formattedValue = `${prefix}${value.toLocaleString()}${suffix}`;
  const ariaLabel = `${formattedValue} ${label}`;

  return (
    <div
      ref={ref}
      className={cn('text-center', className)}
      aria-live="polite"
      aria-atomic="true"
      role="status"
    >
      <div
        className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple"
        aria-label={ariaLabel}
      >
        {prefix}
        {inView && !prefersReducedMotion ? (
          <CountUp
            end={value}
            duration={duration}
            decimals={decimals}
            separator=","
            preserveValue={true}
            useEasing={!prefersReducedMotion}
          />
        ) : (
          <span>{value.toLocaleString()}</span>
        )}
        {suffix}
      </div>
      <div className="text-sm text-muted-foreground mt-2" aria-hidden="true">
        {label}
      </div>
    </div>
  );
}