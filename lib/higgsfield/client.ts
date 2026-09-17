import "server-only";

import type { Motion } from "@/lib/higgsfield/motion";

export type { Motion };

/**
 * Higgsfield platform client (server only — the key never reaches a browser).
 *
 * API surface verified against the official @higgsfield/client SDK v0.2.4:
 *   base    https://platform.higgsfield.ai
 *   auth    Authorization: Key KEY_ID:KEY_SECRET
 *   submit  POST {base}{endpoint} (e.g. /v1/image2video/dop)
 *           → { request_id, status_url, ... }
 *   poll    GET {status_url} → { status, video?: {url}, images?: [{url}] }
 *           status: queued | in_progress | completed | failed | nsfw | canceled
 *
 * HIGGSFIELD_API_KEY holds "KEY_ID:KEY_SECRET". When it is unset or "mock",
 * a deterministic in-process mock runs instead so the whole pipeline —
 * queue, poll, ingest, review — can be exercised without spending credits.
 * Mock output is a clearly labeled placeholder and goes through the same
 * review queue; nothing reaches a buyer unapproved either way.
 */

const BASE_URL = "https://platform.higgsfield.ai";

export type ProviderStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

export type SubmitResult = { requestId: string; statusUrl: string };

export type StatusResult = {
  status: ProviderStatus;
  /** Media URL once completed. */
  resultUrl: string | null;
  error: string | null;
};


export interface MediaProvider {
  submit(endpoint: string, input: Record<string, unknown>): Promise<SubmitResult>;
  status(job: { requestId: string; statusUrl: string | null }): Promise<StatusResult>;
  fetchResult(url: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  motions(): Promise<Motion[]>;
}

export function isMockProvider(): boolean {
  const key = process.env.HIGGSFIELD_API_KEY;
  return !key || key === "mock";
}

export function getProvider(): MediaProvider {
  return isMockProvider() ? mockProvider : realProvider;
}

// ---------------------------------------------------------------------------
// Real provider
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${process.env.HIGGSFIELD_API_KEY}`,
    "Content-Type": "application/json",
  };
}

const realProvider: MediaProvider = {
  async submit(endpoint, input) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        `Higgsfield submit failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`,
      );
    }
    const requestId = String(body.request_id ?? body.id ?? "");
    if (!requestId) throw new Error("Higgsfield submit returned no request id");
    const statusUrl = String(body.status_url ?? `${BASE_URL}/requests/${requestId}/status`);
    return { requestId, statusUrl };
  },

  async status(job) {
    const url = job.statusUrl ?? `${BASE_URL}/requests/${job.requestId}/status`;
    const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as {
      status?: string;
      video?: { url?: string };
      images?: { url?: string }[];
      error?: unknown;
      detail?: unknown;
    };
    // A FAILED request is served as HTTP 422 with details in the body.
    if (!res.ok && res.status !== 422) {
      throw new Error(`Higgsfield status failed (${res.status})`);
    }
    const status = (body.status ?? "failed") as ProviderStatus;
    const resultUrl = body.video?.url ?? body.images?.[0]?.url ?? null;
    const error =
      body.error || body.detail ? JSON.stringify(body.error ?? body.detail).slice(0, 300) : null;
    return { status, resultUrl, error };
  },

  async fetchResult(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Result download failed (${res.status})`);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "video/mp4",
    };
  },

  async motions() {
    const res = await fetch(`${BASE_URL}/v1/motions`, {
      headers: authHeaders(),
      // Motion catalog is static enough to cache for the deployment.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const body = (await res.json().catch(() => [])) as unknown;
    return Array.isArray(body) ? (body as Motion[]) : [];
  },
};

// ---------------------------------------------------------------------------
// Mock provider (dev + E2E; no key, no credits)
// ---------------------------------------------------------------------------

type MockJob = { polls: number; prompt: string; slot: string };

// globalThis so all server bundles in one dev/test process share state.
const mockJobs: Map<string, MockJob> = ((globalThis as Record<string, unknown>).__gwMockJobs ??=
  new Map<string, MockJob>()) as Map<string, MockJob>;

let mockCounter = 0;

const mockProvider: MediaProvider = {
  async submit(_endpoint, input) {
    const requestId = `mock-${Date.now().toString(36)}-${++mockCounter}`;
    mockJobs.set(requestId, {
      polls: 0,
      prompt: String(input.prompt ?? ""),
      slot: String(input.mock_slot ?? "asset"),
    });
    return { requestId, statusUrl: `mock:${requestId}` };
  },

  async status(job) {
    const j = mockJobs.get(job.requestId);
    if (!j) {
      // Process restarted since submit — complete anyway so the flow continues.
      return { status: "completed", resultUrl: `mock-result:${job.requestId}:asset`, error: null };
    }
    j.polls += 1;
    if (j.polls < 2) return { status: "in_progress", resultUrl: null, error: null };
    return {
      status: "completed",
      resultUrl: `mock-result:${job.requestId}:${j.slot}`,
      error: null,
    };
  },

  async fetchResult(url) {
    const slot = url.split(":")[2] ?? "asset";
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">` +
      `<rect width="720" height="1280" fill="#24301F"/>` +
      `<text x="360" y="600" fill="#F5F3E9" font-size="48" font-family="sans-serif" text-anchor="middle">MOCK</text>` +
      `<text x="360" y="680" fill="#8DBA5E" font-size="36" font-family="sans-serif" text-anchor="middle">${slot}</text>` +
      `<text x="360" y="740" fill="#BCAA6E" font-size="24" font-family="sans-serif" text-anchor="middle">placeholder — not generated media</text>` +
      `</svg>`;
    return { bytes: new TextEncoder().encode(svg), contentType: "image/svg+xml" };
  },

  async motions() {
    return [
      { id: "mock-crane-down", name: "Crane Down", start_end_frame: true },
      { id: "mock-dolly-in", name: "Dolly In", start_end_frame: true },
      { id: "mock-arc-right", name: "Arc Right" },
    ];
  },
};
