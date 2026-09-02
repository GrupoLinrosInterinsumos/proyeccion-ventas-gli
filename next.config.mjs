/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    serverActions: {
      // The monthly Odoo export is cumulative year-to-date, so it grows through the year
      // (~15MB by July with 7 months of data) — well past the 1MB Server Action default.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
