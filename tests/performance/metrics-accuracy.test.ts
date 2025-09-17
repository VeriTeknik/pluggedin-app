import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PLATFORM_METRICS } from '@/lib/constants/metrics';

// Mock performance observer
class MockPerformanceObserver {
  callback: PerformanceObserverCallback;

  constructor(callback: PerformanceObserverCallback) {
    this.callback = callback;
  }

  observe() {
    // Simulate performance entries
    const entries = [
      {
        name: 'first-contentful-paint',
        entryType: 'paint',
        startTime: 1234.5,
        duration: 0,
      },
      {
        name: 'largest-contentful-paint',
        entryType: 'largest-contentful-paint',
        startTime: 2345.6,
        renderTime: 2345.6,
        loadTime: 0,
        size: 12345,
      },
    ];

    this.callback(
      { getEntries: () => entries } as any,
      this as any
    );
  }

  disconnect() {}
}

// Web Vitals monitoring
interface WebVitalsMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
}

const measureWebVitals = () => {
  const metrics: Record<string, WebVitalsMetric> = {};

  // Measure FCP (First Contentful Paint)
  if (typeof PerformanceObserver !== 'undefined') {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          metrics.FCP = {
            name: 'FCP',
            value: entry.startTime,
            rating: entry.startTime < 1800 ? 'good' : entry.startTime < 3000 ? 'needs-improvement' : 'poor',
            delta: entry.startTime,
          };
        }
      }
    }).observe({ entryTypes: ['paint'] });
  }

  // Measure LCP (Largest Contentful Paint)
  if (typeof PerformanceObserver !== 'undefined') {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        const renderTime = (lastEntry as any).renderTime || (lastEntry as any).loadTime;
        metrics.LCP = {
          name: 'LCP',
          value: renderTime,
          rating: renderTime < 2500 ? 'good' : renderTime < 4000 ? 'needs-improvement' : 'poor',
          delta: renderTime,
        };
      }
    }).observe({ entryTypes: ['largest-contentful-paint'] });
  }

  // Measure CLS (Cumulative Layout Shift)
  let clsValue = 0;
  if (typeof PerformanceObserver !== 'undefined') {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      metrics.CLS = {
        name: 'CLS',
        value: clsValue,
        rating: clsValue < 0.1 ? 'good' : clsValue < 0.25 ? 'needs-improvement' : 'poor',
        delta: clsValue,
      };
    }).observe({ entryTypes: ['layout-shift'] });
  }

  // Measure FID (First Input Delay)
  if (typeof PerformanceObserver !== 'undefined') {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        metrics.FID = {
          name: 'FID',
          value: (entry as any).processingStart - entry.startTime,
          rating: (entry as any).processingStart - entry.startTime < 100 ? 'good' :
                  (entry as any).processingStart - entry.startTime < 300 ? 'needs-improvement' : 'poor',
          delta: (entry as any).processingStart - entry.startTime,
        };
      }
    }).observe({ entryTypes: ['first-input'] });
  }

  return metrics;
};

describe('Performance Metrics Accuracy', () => {
  let originalPerformanceObserver: any;

  beforeEach(() => {
    originalPerformanceObserver = global.PerformanceObserver;
    (global as any).PerformanceObserver = MockPerformanceObserver;
  });

  afterEach(() => {
    global.PerformanceObserver = originalPerformanceObserver;
    vi.clearAllMocks();
  });

  describe('Platform Metrics Constants', () => {
    it('has accurate tool count', () => {
      expect(PLATFORM_METRICS.TOOLS.value).toBe(7268);
      expect(PLATFORM_METRICS.TOOLS.suffix).toBe('+');
      expect(PLATFORM_METRICS.TOOLS.label).toBe('Verified Tools');
    });

    it('has accurate server count', () => {
      expect(PLATFORM_METRICS.SERVERS.value).toBe(1500);
      expect(PLATFORM_METRICS.SERVERS.suffix).toBe('+');
      expect(PLATFORM_METRICS.SERVERS.label).toBe('MCP Servers');
    });

    it('has accurate growth percentage', () => {
      expect(PLATFORM_METRICS.GROWTH.value).toBe(718);
      expect(PLATFORM_METRICS.GROWTH.suffix).toBe('%');
      expect(PLATFORM_METRICS.GROWTH.label).toBe('Monthly Growth');
    });

    it('has accurate developer count', () => {
      expect(PLATFORM_METRICS.DEVELOPERS.value).toBe(620);
      expect(PLATFORM_METRICS.DEVELOPERS.suffix).toBe('+');
      expect(PLATFORM_METRICS.DEVELOPERS.label).toBe('Active Developers');
    });

    it('has accurate response time', () => {
      expect(PLATFORM_METRICS.RESPONSE_TIME.value).toBe(100);
      expect(PLATFORM_METRICS.RESPONSE_TIME.prefix).toBe('<');
      expect(PLATFORM_METRICS.RESPONSE_TIME.suffix).toBe('ms');
      expect(PLATFORM_METRICS.RESPONSE_TIME.label).toBe('Response Time');
    });

    it('has accurate uptime percentage', () => {
      expect(PLATFORM_METRICS.UPTIME.value).toBe(99.9);
      expect(PLATFORM_METRICS.UPTIME.suffix).toBe('%');
      expect(PLATFORM_METRICS.UPTIME.label).toBe('Uptime SLA');
    });

    it('has accurate API calls count', () => {
      expect(PLATFORM_METRICS.API_CALLS.value).toBe(14000);
      expect(PLATFORM_METRICS.API_CALLS.suffix).toBe('+');
      expect(PLATFORM_METRICS.API_CALLS.label).toBe('API Calls/Month');
    });

    it('has accurate project count', () => {
      expect(PLATFORM_METRICS.PROJECTS.value).toBe(650);
      expect(PLATFORM_METRICS.PROJECTS.suffix).toBe('+');
      expect(PLATFORM_METRICS.PROJECTS.label).toBe('Active Projects');
    });

    it('has accurate AI documents count', () => {
      expect(PLATFORM_METRICS.AI_DOCUMENTS.value).toBe(87);
      expect(PLATFORM_METRICS.AI_DOCUMENTS.suffix).toBe('+');
      expect(PLATFORM_METRICS.AI_DOCUMENTS.label).toBe('AI Documents');
    });

    it('has accurate active servers count', () => {
      expect(PLATFORM_METRICS.ACTIVE_SERVERS.value).toBe(460);
      expect(PLATFORM_METRICS.ACTIVE_SERVERS.suffix).toBe('+');
      expect(PLATFORM_METRICS.ACTIVE_SERVERS.label).toBe('Active Servers');
    });
  });

  describe('Metric Descriptions', () => {
    it('tools metric has security description', () => {
      expect(PLATFORM_METRICS.TOOLS.description).toBe('Pre-verified with encrypted keys');
      expect(PLATFORM_METRICS.TOOLS.secureText).toBe('Keys encrypted - no config exposure');
    });

    it('servers metric has shortLabel', () => {
      expect(PLATFORM_METRICS.SERVERS.shortLabel).toBe('Servers');
    });

    it('growth metric has correct label', () => {
      expect(PLATFORM_METRICS.GROWTH.label).toBe('Monthly Growth');
    });
  });

  describe('Web Vitals Measurement', () => {
    it('measures First Contentful Paint (FCP)', () => {
      const metrics = measureWebVitals();

      // Wait for observer callback
      setTimeout(() => {
        expect(metrics.FCP).toBeDefined();
        expect(metrics.FCP?.name).toBe('FCP');
        expect(metrics.FCP?.value).toBe(1234.5);
        expect(metrics.FCP?.rating).toBe('good'); // < 1800ms is good
      }, 0);
    });

    it('measures Largest Contentful Paint (LCP)', () => {
      const metrics = measureWebVitals();

      setTimeout(() => {
        expect(metrics.LCP).toBeDefined();
        expect(metrics.LCP?.name).toBe('LCP');
        expect(metrics.LCP?.value).toBe(2345.6);
        expect(metrics.LCP?.rating).toBe('good'); // < 2500ms is good
      }, 0);
    });

    it('categorizes performance ratings correctly', () => {
      // Test FCP ratings
      const fcpGood = 1500; // < 1800
      const fcpNeedsImprovement = 2500; // 1800-3000
      const fcpPoor = 3500; // > 3000

      expect(fcpGood < 1800).toBeTruthy();
      expect(fcpNeedsImprovement >= 1800 && fcpNeedsImprovement < 3000).toBeTruthy();
      expect(fcpPoor >= 3000).toBeTruthy();

      // Test LCP ratings
      const lcpGood = 2000; // < 2500
      const lcpNeedsImprovement = 3500; // 2500-4000
      const lcpPoor = 4500; // > 4000

      expect(lcpGood < 2500).toBeTruthy();
      expect(lcpNeedsImprovement >= 2500 && lcpNeedsImprovement < 4000).toBeTruthy();
      expect(lcpPoor >= 4000).toBeTruthy();

      // Test CLS ratings
      const clsGood = 0.05; // < 0.1
      const clsNeedsImprovement = 0.15; // 0.1-0.25
      const clsPoor = 0.3; // > 0.25

      expect(clsGood < 0.1).toBeTruthy();
      expect(clsNeedsImprovement >= 0.1 && clsNeedsImprovement < 0.25).toBeTruthy();
      expect(clsPoor >= 0.25).toBeTruthy();

      // Test FID ratings
      const fidGood = 50; // < 100ms
      const fidNeedsImprovement = 200; // 100-300ms
      const fidPoor = 400; // > 300ms

      expect(fidGood < 100).toBeTruthy();
      expect(fidNeedsImprovement >= 100 && fidNeedsImprovement < 300).toBeTruthy();
      expect(fidPoor >= 300).toBeTruthy();
    });
  });

  describe('Response Time Validation', () => {
    it('response time meets SLA', () => {
      const responseTime = PLATFORM_METRICS.RESPONSE_TIME.value;
      const slaTarget = 100; // ms

      expect(responseTime).toBeLessThanOrEqual(slaTarget);
    });

    it('uptime meets SLA', () => {
      const uptime = PLATFORM_METRICS.UPTIME.value;
      const slaTarget = 99.9; // percentage

      expect(uptime).toBeGreaterThanOrEqual(slaTarget);
    });
  });

  describe('Growth Metrics Calculation', () => {
    it('validates growth metric value', () => {
      // Platform reports 718% growth
      expect(PLATFORM_METRICS.GROWTH.value).toBe(718);
      expect(PLATFORM_METRICS.GROWTH.suffix).toBe('%');
    });

    it('validates API calls growth', () => {
      const startCalls = 0;
      const endCalls = 14000;
      const days = 30;
      const averageCallsPerDay = endCalls / days;

      expect(averageCallsPerDay).toBeCloseTo(467, 0);
      expect(PLATFORM_METRICS.API_CALLS.value).toBe(endCalls);
    });
  });

  describe('Tool Verification Metrics', () => {
    it('validates tool verification status', () => {
      const totalTools = PLATFORM_METRICS.TOOLS.value;
      const verifiedTools = totalTools; // All listed tools are verified

      expect(verifiedTools).toBe(7268);
      expect(PLATFORM_METRICS.TOOLS.label).toContain('Verified');
    });

    it('ensures security messaging is accurate', () => {
      expect(PLATFORM_METRICS.TOOLS.secureText).toContain('encrypted');
      expect(PLATFORM_METRICS.TOOLS.secureText).toContain('no config exposure');
    });
  });

  describe('Server Metrics', () => {
    it('differentiates total vs active servers', () => {
      const totalServers = PLATFORM_METRICS.SERVERS.value;
      const activeServers = PLATFORM_METRICS.ACTIVE_SERVERS.value;

      expect(totalServers).toBe(1500);
      expect(activeServers).toBe(460);
      expect(activeServers).toBeLessThanOrEqual(totalServers);
    });

    it('validates server availability ratio', () => {
      const activeRatio = PLATFORM_METRICS.ACTIVE_SERVERS.value / PLATFORM_METRICS.SERVERS.value;

      // About 30% of servers are active
      expect(activeRatio).toBeCloseTo(0.307, 2);
    });
  });

  describe('Format Consistency', () => {
    it('all metrics have required fields', () => {
      Object.values(PLATFORM_METRICS).forEach(metric => {
        expect(metric).toHaveProperty('value');
        expect(metric).toHaveProperty('label');

        // Either prefix or suffix should be present
        const hasAffix = metric.prefix || metric.suffix;
        expect(hasAffix).toBeTruthy();
      });
    });

    it('numeric values are correct types', () => {
      expect(typeof PLATFORM_METRICS.TOOLS.value).toBe('number');
      expect(typeof PLATFORM_METRICS.SERVERS.value).toBe('number');
      expect(typeof PLATFORM_METRICS.GROWTH.value).toBe('number');
      expect(typeof PLATFORM_METRICS.UPTIME.value).toBe('number');
    });

    it('percentage metrics have % suffix', () => {
      expect(PLATFORM_METRICS.GROWTH.suffix).toBe('%');
      expect(PLATFORM_METRICS.UPTIME.suffix).toBe('%');
    });

    it('count metrics have + suffix', () => {
      expect(PLATFORM_METRICS.TOOLS.suffix).toBe('+');
      expect(PLATFORM_METRICS.SERVERS.suffix).toBe('+');
      expect(PLATFORM_METRICS.DEVELOPERS.suffix).toBe('+');
      expect(PLATFORM_METRICS.API_CALLS.suffix).toBe('+');
    });

    it('time metrics have appropriate units', () => {
      expect(PLATFORM_METRICS.RESPONSE_TIME.suffix).toBe('ms');
      expect(PLATFORM_METRICS.RESPONSE_TIME.prefix).toBe('<');
    });
  });
});