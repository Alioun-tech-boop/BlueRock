/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export' retiré — les routes dynamiques /community/post/[id] nécessitent un serveur (ou fallback)
  // En prod Vercel/Netlify, utiliser 'standalone' ou ISR avec fallback
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  allowedDevOrigins: ['http://localhost:3000', 'http://192.168.100.32:3000', 'http://10.102.37.150:3000']
}
module.exports = nextConfig
