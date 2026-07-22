/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // geoip-lite reads its MaxMind data files from its own package dir at runtime;
  // let it load from node_modules instead of being bundled (webpack rewrites
  // __dirname and drops the .dat files, so bundling breaks the lookup).
  serverExternalPackages: ["geoip-lite"],
  async redirects() {
    return [
      // The canonical page uses the Australian spelling "adviser"; catch the
      // American "advisor" spelling people will inevitably type.
      { source: "/for-advisors", destination: "/for-advisers", permanent: true },
      { source: "/advisors", destination: "/for-advisers", permanent: true },
      { source: "/advisers", destination: "/for-advisers", permanent: true },
    ];
  },
};

export default nextConfig;
