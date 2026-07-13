import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const secureProduction = process.env.NODE_ENV === "production"
  && process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") === true;
const scriptPolicy = process.env.NODE_ENV === "development"
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const contentSecurityPolicy = [
  "default-src 'self'",
  scriptPolicy,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(secureProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const publicArtifactHeaders = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, HEAD, OPTIONS" },
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
  { key: "Cache-Control", value: "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" },
];

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(secureProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@sepbase/sdk", "@sepbase/mcp"],
  poweredByHeader: false,
  experimental: {
    typedEnv: true,
  },
  async headers() {
    return [
      { source: "/deployment-manifest.json", headers: publicArtifactHeaders },
      { source: "/deployment-manifest.v3.json", headers: publicArtifactHeaders },
      { source: "/agent-integration.json", headers: publicArtifactHeaders },
      { source: "/abi/:path*", headers: publicArtifactHeaders },
      { source: "/integrations/:path*", headers: publicArtifactHeaders },
      { source: "/llms.txt", headers: publicArtifactHeaders },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withWorkflow(nextConfig);
