/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for Cloudflare
  output: "standalone",
  
  // Disable image optimization for Cloudflare
  images: {
    unoptimized: true,
  },
  
  // Ensure trailing slashes
  trailingSlash: true,
};

export default nextConfig;
