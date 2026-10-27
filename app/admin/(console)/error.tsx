"use client";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the admin console: a server-side exception becomes a
 * readable in-app message with the reference code, instead of Next's bare
 * "Application error" page.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card stack" style={{ maxWidth: 560 }} data-testid="admin-error">
      <h2>Something broke on the server</h2>
      <p className="muted">
        The last action didn&apos;t complete. Try again — if it keeps happening, send the
        reference code below along with what you were doing.
      </p>
      {error.digest ? <p className="t-small muted">Reference: {error.digest}</p> : null}
      <div className="row">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
