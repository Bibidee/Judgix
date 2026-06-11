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
  async redirects() {
    return [
      // V1 renamed /submit → /create. Keep old links working.
      { source: "/submit", destination: "/create", permanent: false },
      // V1 has no donations/review docket. Send anyone landing there to /campaigns.
      { source: "/review", destination: "/campaigns", permanent: false },
    ];
  },
};
