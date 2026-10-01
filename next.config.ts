import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Geometry imports (KML/KMZ with embedded overlays) arrive as server-action
  // form posts; the framework default of 1 MB silently rejected them before
  // our own size checks could even run.
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  eslint: {
    dirs: ["app", "components", "lib", "tests"],
  },
  // Baseline security headers (audit v2). No page here is ever legitimately
  // framed — DENY kills clickjacking against signed-in admins outright —
  // and the referrer policy keeps tokenized walk URLs (?t=…) from leaking
  // to third-party hosts a walk links out to.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // The walk HUD and the admin GPS capture need geolocation;
            // nothing needs camera or microphone.
            value: "geolocation=(self), camera=(), microphone=()",
          },
        ],
      },
    ];
  },
};

const config = withSerwist(withNextIntl(nextConfig));

// Sentry is wired but optional: without SENTRY_DSN / SENTRY_AUTH_TOKEN this is a no-op wrapper.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(config, { silent: true })
  : config;
