import type { NextConfig } from 'next';
import './scripts/prepare-maplibre-assets.mjs';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
