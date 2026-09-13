/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{protocol:'https', hostname:'**'}] },
  env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL },
  output: 'standalone',
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};
module.exports = nextConfig;
