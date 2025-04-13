import { NextConfig } from 'next/types';
import { WebpackConfigContext } from 'next/dist/server/config-shared';
import { Configuration as WebpackConfig } from 'webpack';

import packageJson from './package.json';

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['plugged.in'],
  async rewrites() {
    return [];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['plugged.in'],
    },
    staleTimes: {
      dynamic: 30,  // 30 seconds for dynamic content
      static: 180,  // 3 minutes for static content
    },
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

export default nextConfig;
