import * as Sentry from "@sentry/nextjs";

// Sentry is optional: without NEXT_PUBLIC_SENTRY_DSN nothing initializes.
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
