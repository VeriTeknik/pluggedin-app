import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['plugged.in'],
  async rewrites() {
    return [];
  },
};

export default nextConfig;
