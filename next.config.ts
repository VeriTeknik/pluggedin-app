import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/service/:path*',
        destination: 'http://localhost:8787/:path*',
      },
    ];
  },
};

export default nextConfig;
