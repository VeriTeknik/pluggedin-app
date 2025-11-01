'use client';

import { useEffect, useState } from 'react';
import CountUp from 'react-countup';
import { useInView } from 'react-intersection-observer';

import { cn } from '@/lib/utils';

type AnimatedMetricSize = 'sm' | 'md' | 'lg';

interface AnimatedMetricProps {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  decimals?: number;
  className?: string;
  duration?: number;
  description?: string;
  size?: AnimatedMetricSize;
}

export function AnimatedMetric({
  value,
  suffix = '',
  prefix = '',
  label,
  decimals = 0,
  className,
  duration = 2.5,
  description,
  size = 'md',
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

  const formattedValue = `${prefix}${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  })}${suffix}`;
  const ariaLabel = `${formattedValue} ${label}`;
  const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-5xl',
  };

  return (
    <div
      ref={ref}
      className={cn('text-center', className)}
      aria-live="polite"
      aria-atomic="true"
      role="status"
    >
      <div
        className={cn(
          'font-bold text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple',
          sizeClasses[size]
        )}
        aria-label={ariaLabel}
      >
        {inView && !prefersReducedMotion ? (
          <CountUp
            end={value}
            duration={duration}
            decimals={decimals}
            preserveValue
            useEasing={!prefersReducedMotion}
            prefix={prefix}
            suffix={suffix}
          />
        ) : (
          <span>{formattedValue}</span>
        )}
      </div>
      <div className="text-sm text-muted-foreground mt-2" aria-hidden="true">
        {label}
      </div>
      {description ? (
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      ) : null}
    </div>
  );
}
