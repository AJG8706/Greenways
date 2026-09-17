import "server-only";

import type { MediaSlotKind } from "@/lib/media/slots";
import { findMotion, type Motion } from "@/lib/media/provider/motion";
import {
  parseStatusResponse,
  parseSubmitResponse,
  type ProviderStatus,
  type StatusParse,
} from "@/lib/media/provider/parse";

export type { Motion, ProviderStatus };

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

export type SubmitResult = { requestId: string; statusUrl: string };

export type StatusResult = StatusParse;

/**
 * Vendor-neutral generation request. Everything the admin actions know:
 * a prompt, fetchable source frames, a camera-move intent, and a seed.
 * Endpoint paths, model names and body shapes live inside the provider,
 * so swapping vendors means implementing MediaProvider in this folder
 * and switching getProvider() — nothing outside changes.
 */
export type GenerationRequest = {
  slotKey: string;
  kind: MediaSlotKind;
  prompt: string;
  /** Signed source-frame URLs, start first (end frame second when used). */
  sourceUrls: string[];
  /** Camera-move intent, e.g. "crane down" — mapped to a vendor preset. */
  motionQuery: string;
  targetSeconds: number;
  seed: number;
};


export interface MediaProvider {
  submitGeneration(req: GenerationRequest): Promise<SubmitResult>;
  status(job: { requestId: string; statusUrl: string | null }): Promise<StatusResult>;
  fetchResult(url: string): Promise<{ bytes: Uint8Array; contentType: string }>;
}

export function isMockProvider(): boolean {
  const key = process.env.HIGGSFIELD_API_KEY;
  return !key || key === "mock";
}

export function getProvider(): MediaProvider {
  return isMockProvider() ? mockProvider : realProvider;
}

/**
 * Credential health check for the Media tab. Never returns the secret —
 * only shape diagnostics and the live auth result from GET /v1/motions.
 */
export async function checkCredentials(): Promise<{
  ok: boolean;
  mode: "mock" | "real";
  detail: string;
}> {
  if (isMockProvider()) {
    return {
      ok: true,
      mode: "mock",
      detail: "Test mode — no media API key configured. No credits are spent.",
    };
  }

  const raw = process.env.HIGGSFIELD_API_KEY ?? "";
  const problems: string[] = [];
  if (raw !== raw.trim()) problems.push("value has leading/trailing whitespace");
  if (/["']/.test(raw)) problems.push("value contains quote characters");
  if (/\s/.test(raw.trim())) problems.push("value contains spaces or line breaks");
  if (/^key\s/i.test(raw.trim())) problems.push('value starts with "Key " — store only ID:SECRET');
  const parts = raw.trim().split(":");
  const shape =
    parts.length === 2
      ? `key id ${parts[0]!.slice(0, 6)}… (${parts[0]!.length} chars) : secret (${parts[1]!.length} chars)`
      : `expected exactly one ":" separating KEY_ID:KEY_SECRET — found ${parts.length - 1}`;
  if (parts.length !== 2) problems.push("missing/multiple colons");

  let live: string;
  try {
    const res = await fetch(`${BASE_URL}/v1/motions`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json().catch(() => [])) as unknown[];
      live = `auth OK — motions endpoint returned ${Array.isArray(body) ? body.length : "?"} camera moves`;
    } else {
      const text = (await res.text().catch(() => "")).slice(0, 160);
      live = `auth check failed: HTTP ${res.status} ${text}`;
    }
  } catch (e) {
    live = `auth check unreachable: ${e instanceof Error ? e.message : "network error"}`;
  }

  const ok = problems.length === 0 && live.startsWith("auth OK");
  return {
    ok,
    mode: "real",
    detail: [shape, ...problems, live].join(" · "),
  };
}

// ---------------------------------------------------------------------------
// Real provider
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${process.env.HIGGSFIELD_API_KEY}`,
    "Content-Type": "application/json",
    // Match the official SDK's UA — the platform expects a server client.
    "User-Agent": "higgsfield-server-js/2.0",
  };
}

// Higgsfield wire details (the only place they exist).
const ENDPOINT = "/v1/image2video/dop";
const MODEL = "dop-turbo";

async function fetchMotions(): Promise<Motion[]> {
  const res = await fetch(`${BASE_URL}/v1/motions`, {
    headers: authHeaders(),
    // Motion catalog is static enough to cache for the deployment.
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(body) ? (body as Motion[]) : [];
}

const realProvider: MediaProvider = {
  async submitGeneration(req) {
    const motion = findMotion(await fetchMotions().catch(() => []), req.motionQuery);
    const input: Record<string, unknown> = {
      model: MODEL,
      prompt: req.prompt,
      // DoP validates input_images to AT MOST ONE item (422 otherwise), so
      // only the start frame is sent; the corner clips' stake close-up end
      // frame stays in the request for a vendor/endpoint that supports it,
      // and the prompt itself carries "ending close on the stake".
      input_images: req.sourceUrls.slice(0, 1).map((u) => ({ type: "image_url", image_url: u })),
      seed: req.seed,
    };
    if (motion) input.motions = [{ id: motion.id, strength: 0.8 }];

    const res = await fetch(`${BASE_URL}${ENDPOINT}`, {
      method: "POST",
      headers: authHeaders(),
      // v1 endpoints take the generation fields wrapped in `params`.
      body: JSON.stringify({ params: input }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        `Media generation submit failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`,
      );
    }
    const parsed = parseSubmitResponse(body, BASE_URL);
    if (!parsed) throw new Error("Media generation submit returned no request id");
    return parsed;
  },

  async status(job) {
    const url = job.statusUrl ?? `${BASE_URL}/requests/${job.requestId}/status`;
    const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Parameters<
      typeof parseStatusResponse
    >[0];
    // A FAILED request is served as HTTP 422 with details in the body.
    if (!res.ok && res.status !== 422) {
      throw new Error(`Media generation status check failed (${res.status})`);
    }
    return parseStatusResponse(body);
  },

  async fetchResult(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Result download failed (${res.status})`);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "video/mp4",
    };
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
  async submitGeneration(req) {
    const requestId = `mock-${Date.now().toString(36)}-${++mockCounter}`;
    mockJobs.set(requestId, {
      polls: 0,
      prompt: req.prompt,
      slot: req.slotKey,
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

};
