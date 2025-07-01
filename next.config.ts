import { withSentryConfig } from '@sentry/nextjs';
import { WebpackConfigContext } from 'next/dist/server/config-shared';
import { NextConfig } from 'next/types';
import { Configuration as WebpackConfig } from 'webpack';

import packageJson from './package.json';

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['plugged.in'],
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
      allowedOrigins: ['plugged.in'],
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
        },
      };
    }

    return config;
  },
};

export default withSentryConfig(nextConfig, {
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
  tunnelRoute: '/monitoring',

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
