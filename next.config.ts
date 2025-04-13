import type { NextConfig } from 'next';
import type { WebpackConfigContext } from 'next/dist/server/config-shared';
import type { Configuration as WebpackConfig } from 'webpack';

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
