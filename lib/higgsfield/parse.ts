// Pure response parsing for the Higgsfield platform API, unit-tested apart
// from the server-only client. The platform speaks two dialects (verified
// against @higgsfield/client v0.2.4):
//   v1 (e.g. POST /v1/image2video/dop): body is { params: {...} }; the
//      response is a job set { id, jobs: [{ id, status, results }] } polled
//      at GET /v1/job-sets/{id}.
//   v2: body is the input directly; the response carries request_id and
//      status_url, polled there: { status, video?: {url}, images?: [{url}] }.

export type ProviderStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

export type SubmitParse = { requestId: string; statusUrl: string };

export type StatusParse = {
  status: ProviderStatus;
  /** Media URL once completed. */
  resultUrl: string | null;
  error: string | null;
};

type Job = {
  status?: string;
  results?: { raw?: { url?: string }; min?: { url?: string } } | null;
};

export function parseSubmitResponse(
  body: Record<string, unknown>,
  baseUrl: string,
): SubmitParse | null {
  const requestId = String(body.request_id ?? body.id ?? "");
  if (!requestId) return null;
  const statusUrl = body.status_url
    ? String(body.status_url)
    : Array.isArray(body.jobs)
      ? `${baseUrl}/v1/job-sets/${requestId}`
      : `${baseUrl}/requests/${requestId}/status`;
  return { requestId, statusUrl };
}

const TERMINAL_ORDER: ProviderStatus[] = ["completed", "nsfw", "failed", "canceled"];

export function parseStatusResponse(body: {
  status?: string;
  jobs?: Job[];
  video?: { url?: string };
  images?: { url?: string }[];
  error?: unknown;
  detail?: unknown;
}): StatusParse {
  // v1 job-set shape: overall status is derived from the jobs (the SDK
  // treats any terminal job as ending the poll; ours are single-job sets).
  if (Array.isArray(body.jobs)) {
    const statuses = body.jobs.map((j) => j.status);
    for (const terminal of TERMINAL_ORDER) {
      if (statuses.includes(terminal)) {
        const done = body.jobs.find((j) => j.status === terminal);
        return {
          status: terminal,
          resultUrl: done?.results?.raw?.url ?? null,
          error: null,
        };
      }
    }
    return {
      status: statuses.includes("in_progress") ? "in_progress" : "queued",
      resultUrl: null,
      error: null,
    };
  }

  // v2 request shape.
  const status = (body.status ?? "failed") as ProviderStatus;
  const resultUrl = body.video?.url ?? body.images?.[0]?.url ?? null;
  const error =
    body.error || body.detail ? JSON.stringify(body.error ?? body.detail).slice(0, 300) : null;
  return { status, resultUrl, error };
}
