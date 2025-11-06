'use client';

import { useEffect } from 'react';
import { CLSMetric, FCPMetric, INPMetric,LCPMetric, onCLS, onFCP, onINP, onLCP, onTTFB, TTFBMetric } from 'web-vitals';

type MetricType = CLSMetric | FCPMetric | LCPMetric | TTFBMetric | INPMetric;

interface WebVitalsConfig {
  analyticsEnabled?: boolean;
  debug?: boolean;
  reportToConsole?: boolean;
  reportToAnalytics?: (metric: MetricType) => void;
  thresholds?: {
    FCP?: number;
    LCP?: number;
    CLS?: number;
    TTFB?: number;
    INP?: number;
  };
}

const DEFAULT_THRESHOLDS = {
  FCP: 1800,   // First Contentful Paint - Good < 1.8s
  LCP: 2500,   // Largest Contentful Paint - Good < 2.5s
  CLS: 0.1,    // Cumulative Layout Shift - Good < 0.1
  TTFB: 800,   // Time to First Byte - Good < 800ms
  INP: 200,    // Interaction to Next Paint - Good < 200ms (replaces FID)
};

export function WebVitalsReporter({
  analyticsEnabled = true,
  debug = false,
  reportToConsole = false,
  reportToAnalytics,
  thresholds = DEFAULT_THRESHOLDS,
}: WebVitalsConfig = {}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sendToAnalytics = (metric: MetricType) => {
      const body = {
        dsn: process.env.NEXT_PUBLIC_WEB_VITALS_ID,
        id: metric.id,
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        navigationType: metric.navigationType,
        delta: metric.delta,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        connectionType: (navigator as any).connection?.effectiveType,
      };

      // Check if metric exceeds threshold
      const threshold = thresholds[metric.name as keyof typeof thresholds];
      const isAboveThreshold = threshold && metric.value > threshold;

      if (reportToConsole || debug) {
        const emoji = metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌';
        console.log(
          `${emoji} ${metric.name}: ${metric.value.toFixed(2)}${metric.name === 'CLS' ? '' : 'ms'} (${metric.rating})`,
          isAboveThreshold ? '- ABOVE THRESHOLD' : ''
        );

        if (debug) {
          console.log('Full metric:', metric);
        }
      }

      if (analyticsEnabled) {
        // Send to custom analytics endpoint
        if (reportToAnalytics) {
          reportToAnalytics(metric);
        }

        // Send to Next.js analytics if available
        if (window.gtag) {
          window.gtag('event', metric.name, {
            value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
            event_category: 'Web Vitals',
            event_label: metric.rating,
            non_interaction: true,
          });
        }

        // Send to Vercel Analytics if available
        if ((window as any).va) {
          (window as any).va('event', {
            name: 'web-vitals',
            data: {
              metric: metric.name,
              value: metric.value,
              rating: metric.rating,
            },
          });
        }
      }

      // Log poor performance metrics to error tracking
      if (metric.rating === 'poor' && process.env.NODE_ENV === 'production') {
        // This will be caught by the error boundary telemetry
        console.error(`Poor Web Vital: ${metric.name}`, body);
      }
    };

    // Register all Web Vitals observers
    try {
      onFCP(sendToAnalytics);
      onLCP(sendToAnalytics);
      onCLS(sendToAnalytics);
      onTTFB(sendToAnalytics);
      onINP(sendToAnalytics); // INP replaces FID in Web Vitals v5
    } catch (error) {
      console.error('Failed to initialize Web Vitals tracking:', error);
    }
  }, [analyticsEnabled, debug, reportToConsole, reportToAnalytics, thresholds]);

  return null;
}

// Hook for manual Web Vitals reporting
export function useWebVitals(callback?: (metric: MetricType) => void) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMetric = (metric: MetricType) => {
      if (callback) {
        callback(metric);
      }
    };

    try {
      onFCP(handleMetric);
      onLCP(handleMetric);
      onCLS(handleMetric);
      onTTFB(handleMetric);
      onINP(handleMetric);
    } catch (error) {
      console.error('Failed to register Web Vitals listener:', error);
    }
  }, [callback]);
}

// Utility to format Web Vitals for display
export function formatWebVital(name: string, value: number): string {
  switch (name) {
    case 'CLS':
      return value.toFixed(3);
    case 'FCP':
    case 'LCP':
    case 'TTFB':
    case 'INP':
      return `${Math.round(value)}ms`;
    default:
      return value.toString();
  }
}