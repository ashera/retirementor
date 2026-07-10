/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
