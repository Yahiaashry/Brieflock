const path = require("node:path");

const storageOrigins = ["'self'", "https://*.supabase.co"];
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  storageOrigins.push(storage.origin);
}

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

// The viewer is a static, sandboxed pdf.js host. It needs its inline module
// bootstrap and a blob worker; the app shell gets a nonce-based CSP from
// proxy.ts so Next.js can sign its own hydration scripts.
const viewerCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src ${[...new Set(storageOrigins)].join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "sandbox allow-scripts",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 otherwise writes AGENTS.md into the project on dev/build.
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: "/viewer/:path*",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: viewerCsp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
