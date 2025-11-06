/**
 * Type definitions for Google Analytics gtag.js
 *
 * This provides TypeScript type safety for Google Analytics interactions
 * throughout the application.
 */

export {};

declare global {
  interface Window {
    /**
     * Google Analytics gtag function
     * @see https://developers.google.com/analytics/devguides/collection/gtagjs
     */
    gtag?: (
      command: 'config' | 'event' | 'set' | 'js' | 'consent',
      targetId: string | Date,
      config?: Gtag.ControlParams | Gtag.EventParams | Gtag.CustomParams | Gtag.ConsentParams
    ) => void;

    /**
     * Google Analytics data layer
     * @see https://developers.google.com/tag-platform/devguides/datalayer
     */
    dataLayer?: any[];
  }
}

declare namespace Gtag {
  interface ControlParams {
    groups?: string | string[];
    send_to?: string | string[];
    event_callback?: () => void;
    event_timeout?: number;
  }

  interface EventParams {
    event_category?: string;
    event_label?: string;
    value?: number;
    non_interaction?: boolean;
    [key: string]: any;
  }

  interface CustomParams {
    [key: string]: any;
  }

  interface ConsentParams {
    ad_storage?: 'granted' | 'denied';
    analytics_storage?: 'granted' | 'denied';
    functionality_storage?: 'granted' | 'denied';
    personalization_storage?: 'granted' | 'denied';
    security_storage?: 'granted' | 'denied';
    wait_for_update?: number;
  }

  interface ConfigParams {
    page_path?: string;
    page_title?: string;
    page_location?: string;
    send_page_view?: boolean;
    cookie_domain?: string;
    cookie_expires?: number;
    cookie_flags?: string;
    cookie_prefix?: string;
    cookie_update?: boolean;
    anonymize_ip?: boolean;
    [key: string]: any;
  }
}
