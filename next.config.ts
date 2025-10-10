import { withSentryConfig } from '@sentry/nextjs';
import { WebpackConfigContext } from 'next/dist/server/config-shared';
import { NextConfig } from 'next/types';
import { Configuration as WebpackConfig } from 'webpack';

import packageJson from './package.json';

// Bundle analyzer for performance optimization
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['plugged.in', 'staging.plugged.in'],
  async rewrites() {
    return [];
  },
  async redirects() {
    return [
      {
        source: '/privacy',
        destination: '/legal/privacy-policy',
        permanent: true,
      },
      {
        source: '/terms',
        destination: '/legal/terms-of-service',
        permanent: true,
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['plugged.in', 'staging.plugged.in'],
      bodySizeLimit: '100mb', // Allow up to 100MB file uploads
    },
    staleTimes: {
      dynamic: 30, // 30 seconds for dynamic content
      static: 180, // 3 minutes for static content
    },
  },
  // Fix for dynamic server usage error
  staticPageGenerationTimeout: 120, // Increase timeout for static page generation
  
  // ESLint configuration for production builds
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },

  webpack: (config: WebpackConfig, { isServer }: WebpackConfigContext) => {
    // Force Next.js to use the native Node.js fetch
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...(config.resolve?.fallback || {}),
          fs: false,
          net: false,
          tls: false,
          canvas: false, // Prevent canvas from being bundled on client
        },
      };

      // PDF.js worker is now served as static file from /public/pdf.worker.min.mjs
    }

    // Externalize canvas for server-side builds (used by jsdom/dompurify)
    if (isServer) {
      if (!config.externals) {
        config.externals = [];
      }
      if (Array.isArray(config.externals)) {
        config.externals.push('canvas');
      }
    }

    // Suppress webpack cache warnings for large translation files
    config.infrastructureLogging = {
      ...config.infrastructureLogging,
      level: 'error', // Only show errors, not warnings
    };

    // Alternative: Configure cache to handle large strings better
    if (typeof config.cache === 'object' && config.cache !== null && !Array.isArray(config.cache)) {
      config.cache = {
        ...config.cache,
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
      };
    }

    return config;
  },
};

// Wrap with bundle analyzer first, then Sentry
const configWithAnalyzer = withBundleAnalyzer(nextConfig);

export default withSentryConfig(configWithAnalyzer, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'veriteknik',
  project: 'pluggedin',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: '/monitoring', // Temporarily disabled due to rate limiting issues causing page hangs

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
