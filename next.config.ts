import withPWA from '@ducanh2912/next-pwa'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {},
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  async redirects() {
    const legacySettings = [
      "ticket-statuses",
      "ticket-types",
      "tags",
      "email-integration",
      "slack-notifications",
      "message-templates",
      "automation-rules",
      "knowledge-base",
    ] as const
    return [
      ...legacySettings.flatMap((seg) => [
        { source: `/${seg}`, destination: `/settings/${seg}`, permanent: true },
        { source: `/${seg}/:path*`, destination: `/settings/${seg}/:path*`, permanent: true },
      ]),
      { source: "/users", destination: "/settings/users", permanent: true },
      { source: "/users/:path*", destination: "/settings/users/:path*", permanent: true },
      { source: "/companies", destination: "/settings/companies", permanent: true },
      { source: "/companies/:path*", destination: "/settings/companies/:path*", permanent: true },
      { source: "/teams", destination: "/settings/teams", permanent: true },
      { source: "/teams/:path*", destination: "/settings/teams/:path*", permanent: true },
    ]
  },
};

export default withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
  },
})(nextConfig);
