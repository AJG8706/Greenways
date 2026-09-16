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
  eslint: {
    dirs: ["app", "components", "lib", "tests"],
  },
};

const config = withSerwist(withNextIntl(nextConfig));

// Sentry is wired but optional: without SENTRY_DSN / SENTRY_AUTH_TOKEN this is a no-op wrapper.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(config, { silent: true })
  : config;
