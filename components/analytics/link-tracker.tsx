'use client';

import { useEffect } from 'react';

interface LinkAnalytics {
  url: string;
  category: 'documentation' | 'external' | 'social' | 'download';
  label?: string;
  timestamp: string;
  sessionId?: string;
}

class LinkTracker {
  private static instance: LinkTracker;
  private queue: LinkAnalytics[] = [];
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  static getInstance(): LinkTracker {
    if (!LinkTracker.instance) {
      LinkTracker.instance = new LinkTracker();
    }
    return LinkTracker.instance;
  }

  private generateSessionId(): string {
    // Use crypto.getRandomValues for secure randomness
    const array = new Uint8Array(16);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(array);
    }
    const randomHex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    return `session_${Date.now()}_${randomHex.substring(0, 9)}`;
  }

  trackLink(url: string, category: LinkAnalytics['category'], label?: string) {
    const analytics: LinkAnalytics = {
      url,
      category,
      label,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Link tracked:', analytics);
    }

    // Send to analytics service
    this.sendAnalytics(analytics);

    // Add to queue for batch processing
    this.queue.push(analytics);
    if (this.queue.length >= 10) {
      this.flushQueue();
    }
  }

  private sendAnalytics(data: LinkAnalytics) {
    // Send to Google Analytics if available
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'click', {
        event_category: `${data.category}_link`,
        event_label: data.label || data.url,
        value: data.url,
        custom_parameter: {
          session_id: data.sessionId,
          timestamp: data.timestamp
        }
      });
    }

    // Send to Vercel Analytics if available
    if (typeof window !== 'undefined' && (window as any).va) {
      (window as any).va('event', {
        name: `${data.category}-link-click`,
        data: {
          url: data.url,
          label: data.label,
          sessionId: data.sessionId
        }
      });
    }

    // Custom analytics endpoint
    if (process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT) {
      fetch(process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'link_click', ...data })
      }).catch(err => console.error('Analytics error:', err));
    }
  }

  private async flushQueue() {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    if (process.env.NEXT_PUBLIC_ANALYTICS_BATCH_ENDPOINT) {
      try {
        await fetch(process.env.NEXT_PUBLIC_ANALYTICS_BATCH_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch })
        });
      } catch (err) {
        console.error('Batch analytics error:', err);
        // Re-add to queue for retry
        this.queue.unshift(...batch);
      }
    }
  }

  // Flush queue before page unload
  setupUnloadHandler() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushQueue();
      });
    }
  }
}

interface TrackedLinkProps {
  href: string;
  category?: LinkAnalytics['category'];
  label?: string;
  children: React.ReactNode;
  className?: string;
  target?: string;
  rel?: string;
}

export function TrackedLink({
  href,
  category = 'external',
  label,
  children,
  className,
  target = '_blank',
  rel = 'noopener noreferrer'
}: TrackedLinkProps) {
  const tracker = LinkTracker.getInstance();

  const handleClick = () => {
    tracker.trackLink(href, category, label);
  };

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}

export function useExternalLinkTracking() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tracker = LinkTracker.getInstance();
    tracker.setupUnloadHandler();

    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a');

      if (!link) return;

      const href = link.href;
      const isExternal = href && (
        href.startsWith('http') && !href.includes(window.location.hostname)
      );

      if (isExternal) {
        // Determine category based on URL patterns using proper URL parsing
        let category: LinkAnalytics['category'] = 'external';

        try {
          const url = new URL(href);
          const hostname = url.hostname.toLowerCase();
          const pathname = url.pathname.toLowerCase();

          // Check documentation sites using hostname and pathname
          if (hostname.includes('docs.') ||
              pathname.includes('/docs/') ||
              pathname.includes('/documentation')) {
            category = 'documentation';
          }
          // Check social media sites using exact hostname matching
          else if (hostname === 'github.com' || hostname === 'www.github.com' ||
                   hostname === 'twitter.com' || hostname === 'www.twitter.com' ||
                   hostname === 'x.com' || hostname === 'www.x.com' ||
                   hostname === 'linkedin.com' || hostname === 'www.linkedin.com') {
            category = 'social';
          }
          // Check downloads using pathname extensions
          else if (pathname.includes('/download') ||
                   pathname.endsWith('.pdf') ||
                   pathname.endsWith('.zip') ||
                   pathname.endsWith('.tar.gz')) {
            category = 'download';
          }
        } catch (e) {
          // If URL parsing fails, keep default 'external' category
          console.warn('Failed to parse URL for categorization:', href);
        }

        // Get label from data attribute or link text
        const label = link.getAttribute('data-track-label') ||
                     link.getAttribute('aria-label') ||
                     link.textContent?.trim().substring(0, 50);

        tracker.trackLink(href, category, label);
      }
    };

    // Attach to document for event delegation
    document.addEventListener('click', handleLinkClick);

    return () => {
      document.removeEventListener('click', handleLinkClick);
    };
  }, []);
}