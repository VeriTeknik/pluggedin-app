import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['plugged.in'],
  async rewrites() {
    return [
      {
        source: '/service/:path*',
        destination: 'https://metatool-service.jczstudio.workers.dev/:path*',
      },
    ];
  },
};

export default nextConfig;
