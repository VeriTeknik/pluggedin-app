import { WebpackConfigContext } from 'next/dist/server/config-shared';
import { NextConfig } from 'next/types';
import { Configuration as WebpackConfig } from 'webpack';

import packageJson from './package.json';

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
  async headers() {
    return [
      {
        // Allow embedding for /embed/* routes
        source: '/embed/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL', // Allow embedding in any iframe (domain check happens in app)
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *;", // Allow any site to embed (domain validation in app)
          },
        ],
      },
      {
        // CORS headers for widget API
        source: '/api/widget',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type',
          },
        ],
      },
      {
        // CORS headers for embedded chat API routes
        source: '/api/embedded-chat/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
        ],
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
        },
      };

      // PDF.js worker is now served as static file from /public/pdf.worker.min.mjs
    }

    return config;
  },
};

export default nextConfig;
