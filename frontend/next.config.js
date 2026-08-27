/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  allowedDevOrigins: ['http://localhost:3000', 'http://192.168.100.32:3000', 'http://10.102.37.150:3000']
}
module.exports = nextConfig
