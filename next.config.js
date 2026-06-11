/** @type {import('next').NextConfig} */
const UPSTREAM = process.env.GENLAYER_UPSTREAM || "https://studio.genlayer.com/api";

module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/genlayer", destination: UPSTREAM },
      { source: "/api/genlayer/:path*", destination: `${UPSTREAM}/:path*` },
    ];
  },
};
