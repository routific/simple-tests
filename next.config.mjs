/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Expose whether Linear auth is configured (client-side check)
    NEXT_PUBLIC_HAS_LINEAR_AUTH: process.env.LINEAR_CLIENT_ID ? "true" : "",
  },
};

export default nextConfig;
