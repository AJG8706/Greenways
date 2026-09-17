"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkCredentials, getProvider } from "@/lib/media/provider";
import { buildPrompt, type MediaBrief } from "@/lib/media/prompts";
import { canGenerateSlot, mediaSlotsFor, type MediaSlot } from "@/lib/media/slots";
import { i18nText } from "@/lib/i18n/text";
import type { Json } from "@/lib/supabase/database.types";

export type ActionResult = { ok: boolean; message?: string };

const SIGN_TTL_S = 60 * 60 * 6;

/**
 * Everything needed to submit (and later re-submit) one generation, in
 * vendor-neutral terms (endpoints/models live inside lib/media/provider).
 * Stored in generation_jobs.payload so a rejection regenerates from the
 * SAME source frames and prompt — only the seed changes (Prompt Library
 * workflow).
 */
type JobSpec = {
  prompt: string;
  motionQuery: string;
  /** Storage paths in property-photos; signed fresh at each submit. */
  sourcePaths: string[];
  seed: number;
};

function newSeed(): number {
  return Math.floor(Math.random() * 1_000_001);
}

async function submitSpec(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propertyId: string,
  slot: { key: string; kind: MediaSlot["kind"]; targetSeconds: number },
  spec: JobSpec,
): Promise<ActionResult> {
  const { data: signed, error: signError } = await supabase.storage
    .from("property-photos")
    .createSignedUrls(spec.sourcePaths, SIGN_TTL_S);
  const urls = (signed ?? []).flatMap((s) => (s.signedUrl ? [s.signedUrl] : []));
  if (signError || urls.length !== spec.sourcePaths.length) {
    return { ok: false, message: "Could not sign the source photos" };
  }

  let requestId: string;
  let statusUrl: string;
  try {
    ({ requestId, statusUrl } = await getProvider().submitGeneration({
      slotKey: slot.key,
      kind: slot.kind,
      prompt: spec.prompt,
      sourceUrls: urls,
      motionQuery: spec.motionQuery,
      targetSeconds: slot.targetSeconds,
      seed: spec.seed,
    }));
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Submit failed" };
  }

  const { error } = await supabase.from("generation_jobs").insert({
    property_id: propertyId,
    kind: slot.kind,
    slot: slot.key,
    status: "queued",
    provider_request_id: requestId,
    status_url: statusUrl,
    seed: spec.seed,
    payload: spec as unknown as Json,
  });
  if (error) return { ok: false, message: error.message };

  await supabase.rpc("write_audit", {
    p_action: "generation_queued",
    p_property_id: propertyId,
    p_detail: { slot: slot.key, request_id: requestId, seed: spec.seed },
  });
  return { ok: true };
}

/** Resolve a slot's source storage paths from the capture-protocol photos. */
async function sourcePathsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propertyId: string,
  slot: MediaSlot,
): Promise<string[] | { missing: string }> {
  if (slot.kind === "corner_approach") {
    const { data: corner } = await supabase
      .from("corners")
      .select("approach_photo, stake_photo")
      .eq("property_id", propertyId)
      .eq("n", slot.cornerN!)
      .maybeSingle();
    if (!corner?.approach_photo) return { missing: `C${slot.cornerN} approach photo` };
    if (!corner.stake_photo) return { missing: `C${slot.cornerN} stake photo` };
    // Start frame = 30-ft approach, end frame = stake close-up (library §2).
    return [corner.approach_photo, corner.stake_photo];
  }

  const wanted =
    slot.kind === "intro" ? ["aerial", "gate"] : slot.kind === "entrance" ? ["gate"] : ["homesite"];
  const { data: captures } = await supabase
    .from("media_assets")
    .select("slot, storage_path")
    .eq("property_id", propertyId)
    .eq("type", "capture")
    .in("slot", wanted);
  const bySlot = new Map((captures ?? []).map((c) => [c.slot, c.storage_path]));
  const paths: string[] = [];
  for (const w of wanted) {
    const p = bySlot.get(w);
    if (!p) return { missing: `${w} photo` };
    paths.push(p);
  }
  return paths;
}

/** Queue one slot's generation (credits discipline enforced server-side). */
export async function queueSlot(propertyId: string, slotKey: string): Promise<ActionResult> {
  const supabase = await createClient();

  const [{ data: property }, { data: corners }, { data: assets }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, acres, address, media_brief")
      .eq("id", propertyId)
      .maybeSingle(),
    supabase.from("corners").select("n, name, stake").eq("property_id", propertyId).order("n"),
    supabase
      .from("media_assets")
      .select("slot, status")
      .eq("property_id", propertyId)
      .neq("type", "capture"),
  ]);
  if (!property) return { ok: false, message: "Property not found" };

  const slots = mediaSlotsFor((corners ?? []).map((c) => c.n));
  const slot = slots.find((s) => s.key === slotKey);
  if (!slot) return { ok: false, message: "Unknown slot" };

  const approved = new Set(
    (assets ?? []).filter((a) => a.status === "approved").map((a) => a.slot),
  );
  if (!canGenerateSlot(slot, approved)) {
    return {
      ok: false,
      message: "Style lock first: approve the intro and entrance before batching corners.",
    };
  }

  const sources = await sourcePathsFor(supabase, propertyId, slot);
  if (!Array.isArray(sources)) {
    return { ok: false, message: `Missing source: upload the ${sources.missing} first.` };
  }

  const prompt = buildPrompt(slot, {
    acres: property.acres === null ? null : Number(property.acres),
    address: property.address,
    brief: (property.media_brief ?? {}) as MediaBrief,
    corners: (corners ?? []).map((c) => ({
      n: c.n,
      label: i18nText(c.name).en || `C${c.n}`,
      stake: i18nText(c.stake).en,
    })),
  });

  const result = await submitSpec(supabase, propertyId, slot, {
    prompt,
    motionQuery: slot.motionQuery,
    sourcePaths: sources,
    seed: newSeed(),
  });
  if (result.ok) revalidatePath(`/admin/properties/${propertyId}`);
  return result;
}

/**
 * Poll every active job for this property; ingest completed results into
 * storage and the review queue. Called from the Media tab (button + interval).
 */
export async function refreshJobs(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: jobs, error } = await supabase
    .from("generation_jobs")
    .select("id, slot, kind, status, status_url, provider_request_id, payload")
    .eq("property_id", propertyId)
    .in("status", ["queued", "in_progress", "completed"]);
  if (error) return { ok: false, message: error.message };

  const provider = getProvider();
  let changed = false;

  for (const job of jobs ?? []) {
    if (!job.provider_request_id) continue;
    try {
      const s = await provider.status({
        requestId: job.provider_request_id,
        statusUrl: job.status_url,
      });

      if (s.status === "completed" && s.resultUrl) {
        const { bytes, contentType } = await provider.fetchResult(s.resultUrl);
        const ext = contentType.includes("mp4")
          ? "mp4"
          : contentType.includes("svg")
            ? "svg"
            : contentType.includes("png")
              ? "png"
              : contentType.includes("webm")
                ? "webm"
                : "jpg";
        const path = `${propertyId}/generated/${job.slot}-${job.id.slice(0, 8)}.${ext}`;
        const { error: upError } = await supabase.storage
          .from("property-photos")
          .upload(path, bytes.slice().buffer as ArrayBuffer, { upsert: true, contentType });
        if (upError) throw new Error(`Storage upload failed: ${upError.message}`);

        const spec = job.payload as unknown as JobSpec;
        const { error: insError } = await supabase.from("media_assets").insert({
          property_id: propertyId,
          type: contentType.startsWith("video/") ? "video" : "image",
          slot: job.slot,
          storage_path: path,
          status: "generated",
          source_photo: spec.sourcePaths?.[0] ?? null,
          provider_request_id: job.provider_request_id,
          job_id: job.id,
        });
        // 23505 on media_assets_job_unique: a concurrent poll already
        // ingested this job — treat as done, don't fail the refresh.
        if (insError && insError.code !== "23505") throw new Error(insError.message);

        await supabase
          .from("generation_jobs")
          .update({ status: "ingested" })
          .eq("id", job.id);
        changed = true;
      } else if (s.status !== job.status) {
        await supabase
          .from("generation_jobs")
          .update({ status: s.status, error: s.error })
          .eq("id", job.id);
        changed = true;
      }
    } catch (e) {
      await supabase
        .from("generation_jobs")
        .update({ error: e instanceof Error ? e.message.slice(0, 300) : "poll failed" })
        .eq("id", job.id);
    }
  }

  if (changed) revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Approve a generated asset — it may now reach buyers (guardrail #3). */
export async function approveAsset(propertyId: string, assetId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("media_assets")
    .update({ status: "approved", reject_reason: null })
    .eq("id", assetId)
    .eq("property_id", propertyId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/**
 * Reject with a reason and regenerate from the same job spec (same source
 * frames, same prompt, new seed).
 */
export async function rejectAsset(
  propertyId: string,
  assetId: string,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, message: "A rejection needs a reason" };

  const supabase = await createClient();
  const { data: asset, error: findError } = await supabase
    .from("media_assets")
    .select("id, slot, job_id")
    .eq("id", assetId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (findError) return { ok: false, message: findError.message };
  if (!asset) return { ok: false, message: "Asset not found" };

  const { error } = await supabase
    .from("media_assets")
    .update({ status: "rejected", reject_reason: trimmed })
    .eq("id", assetId);
  if (error) return { ok: false, message: error.message };

  // Regenerate from the same spec when we still have it.
  if (asset.job_id) {
    const { data: job } = await supabase
      .from("generation_jobs")
      .select("slot, kind, payload")
      .eq("id", asset.job_id)
      .maybeSingle();
    const spec = job?.payload as unknown as (JobSpec & { motionQuery?: string }) | null;
    if (job && spec?.sourcePaths?.length) {
      const kind = job.kind as MediaSlot["kind"];
      const defaults = mediaSlotsFor([1]).find((s) => s.kind === kind);
      const resubmit = await submitSpec(
        supabase,
        propertyId,
        { key: job.slot, kind, targetSeconds: defaults?.targetSeconds ?? 8 },
        {
          prompt: spec.prompt,
          sourcePaths: spec.sourcePaths,
          motionQuery: spec.motionQuery ?? defaults?.motionQuery ?? "dolly in",
          seed: newSeed(),
        },
      );
      if (!resubmit.ok) {
        return {
          ok: false,
          message: `Rejected, but the regeneration failed: ${resubmit.message}`,
        };
      }
    }
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Save the Prompt Library variables for this property. */
export async function saveMediaBrief(
  propertyId: string,
  brief: MediaBrief,
): Promise<ActionResult> {
  const supabase = await createClient();
  const clean: MediaBrief = {
    road: brief.road?.trim() || undefined,
    features: brief.features?.trim() || undefined,
    groundCover: brief.groundCover?.trim() || undefined,
    homesite: brief.homesite?.trim() || undefined,
    entrance: brief.entrance?.trim() || undefined,
  };
  const { error } = await supabase
    .from("properties")
    .update({ media_brief: clean as Json })
    .eq("id", propertyId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Live media-provider credential check for the Media tab (never leaks the secret). */
export async function testMediaProvider(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return { ok: false, message: "Sign in first" };
  const result = await checkCredentials();
  return { ok: result.ok, message: `[${result.mode}] ${result.detail}` };
}

const SLOT_KEY_RE = /^(intro|entrance|homesite|corner_\d+_approach)$/;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)$/i;

/**
 * Record a team-uploaded clip for a slot (browser uploads to storage first,
 * same as the Photos tab). Human-shot media is approved on upload — the
 * review queue exists for AI-generated media (guardrail #3); an upload is
 * the team's own footage, same trust level as capture photos.
 */
export async function recordUploadedClip(
  propertyId: string,
  slot: string,
  storagePath: string,
): Promise<ActionResult> {
  if (!SLOT_KEY_RE.test(slot)) return { ok: false, message: "Unknown slot" };
  if (!storagePath.startsWith(`${propertyId}/uploads/`) || !VIDEO_EXT_RE.test(storagePath)) {
    return { ok: false, message: "Upload a video file (mp4, webm or mov)" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("media_assets").insert({
    property_id: propertyId,
    type: "video",
    slot,
    storage_path: storagePath,
    status: "approved",
  });
  if (error) return { ok: false, message: error.message };

  await supabase.rpc("write_audit", {
    p_action: "media_uploaded",
    p_property_id: propertyId,
    p_detail: { slot, path: storagePath },
  });
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Remove a generated or uploaded clip (never capture photos). Audited. */
export async function removeAsset(propertyId: string, assetId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: asset, error: findError } = await supabase
    .from("media_assets")
    .select("id, slot, type, status, storage_path")
    .eq("id", assetId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (findError) return { ok: false, message: findError.message };
  if (!asset) return { ok: false, message: "Asset not found" };
  if (asset.type === "capture") {
    return { ok: false, message: "Capture photos are replaced from the Photos tab" };
  }

  const { error } = await supabase.from("media_assets").delete().eq("id", assetId);
  if (error) return { ok: false, message: error.message };
  // Best-effort storage cleanup; the row is the source of truth.
  await supabase.storage.from("property-photos").remove([asset.storage_path]);

  await supabase.rpc("write_audit", {
    p_action: "media_removed",
    p_property_id: propertyId,
    p_detail: { slot: asset.slot, status: asset.status, path: asset.storage_path },
  });
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}
