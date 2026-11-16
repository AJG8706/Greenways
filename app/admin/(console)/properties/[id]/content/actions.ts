"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { getServiceKey } from "@/lib/keys";
import { i18nText } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../../actions";

/**
 * "Draft Spanish" helper (guardrail #6): AI drafts, a person reviews.
 * Optional via ANTHROPIC_API_KEY; drafts always land unreviewed.
 */
export async function draftSpanish(
  texts: string[],
): Promise<{ ok: boolean; drafts?: string[]; message?: string }> {
  const anthropicKey = await getServiceKey("anthropic");
  if (!anthropicKey) {
    return { ok: false, message: "Anthropic API key is not configured (Settings → Service keys)" };
  }
  // Team members only: this action touches no table (so RLS never runs) and
  // otherwise makes the model key a free proxy for any authenticated caller.
  const gate = await createClient();
  const { data: userRes } = await gate.auth.getUser();
  const { data: caller } = await gate
    .from("team_users")
    .select("id")
    .eq("user_id", userRes.user?.id ?? "")
    .maybeSingle();
  if (!caller) return { ok: false, message: "Not a team member" };

  const nonEmpty = texts.map((t) => t.trim());
  if (nonEmpty.every((t) => !t)) {
    return { ok: false, message: "Write the English text first" };
  }

  const client = new Anthropic({ apiKey: anthropicKey });
  let response: Anthropic.Message;
  try {
    response = await requestDrafts(client, nonEmpty);
  } catch (error) {
    // A vendor failure is an answer for the admin, never a crash page.
    if (error instanceof Anthropic.AuthenticationError) {
      return {
        ok: false,
        message:
          "Anthropic rejected the API key — it is expired, revoked, or invalid. Rotate it in Settings → Service keys, then try again.",
      };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, message: "Anthropic is rate-limiting right now — try again in a minute." };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, message: `Anthropic API error${error.status ? ` ${error.status}` : ""}: ${error.message}` };
    }
    return { ok: false, message: "Could not reach the Anthropic API — try again." };
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  try {
    const drafts: unknown = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
    if (
      !Array.isArray(drafts) ||
      drafts.length !== texts.length ||
      !drafts.every((d) => typeof d === "string")
    ) {
      return { ok: false, message: "Unexpected draft format — try again" };
    }
    return { ok: true, drafts };
  } catch {
    return { ok: false, message: "Could not parse the draft — try again" };
  }
}

function requestDrafts(client: Anthropic, nonEmpty: string[]): Promise<Anthropic.Message> {
  return client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4000,
    system: [
      "You translate buyer-facing land-walkthrough text from English to Spanish for Texas Greener Pastures.",
      "Style: neutral Latin American Spanish, usted register, short plain sentences readable on a phone in bright sun.",
      "Distances stay in feet (pies). Keep proper nouns (road names, 'Gaines Acres') unchanged.",
      "Input is a JSON array of strings. Reply with ONLY a JSON array of the translations, same length and order. Translate empty strings to empty strings.",
    ].join(" "),
    messages: [{ role: "user", content: JSON.stringify(nonEmpty) }],
  });
}

/**
 * Master helper: draft Spanish for every lot that still has empty ES fields,
 * one model call per lot. Drafts land only in EMPTY ES fields (a person's
 * wording is never overwritten), and any lot that receives drafts drops its
 * "reviewed" flag so the Content tab shows a person has not read the new
 * Spanish yet (tracked, not a publish blocker). Archived lots are skipped.
 */
export async function draftSpanishAllLots(
  masterId: string,
): Promise<{ ok: boolean; message?: string }> {
  const anthropicKey = await getServiceKey("anthropic");
  if (!anthropicKey) {
    return { ok: false, message: "Anthropic API key is not configured (Settings → Service keys)" };
  }
  const gate = await createClient();
  const { data: userRes } = await gate.auth.getUser();
  const { data: caller } = await gate
    .from("team_users")
    .select("id")
    .eq("user_id", userRes.user?.id ?? "")
    .maybeSingle();
  if (!caller) return { ok: false, message: "Not a team member" };

  const { data: lots, error } = await gate
    .from("properties")
    .select("id, slug, name, corners(id, name, stake)")
    .eq("parent_id", masterId)
    .is("archived_at", null)
    .order("sort_order")
    .order("created_at");
  if (error) return { ok: false, message: error.message };
  if (!lots || lots.length === 0) return { ok: false, message: "This property has no lots." };

  const client = new Anthropic({ apiKey: anthropicKey });
  let drafted = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const lot of lots) {
    const name = lot.name as { en?: string; es?: string } | null;
    const corners = (lot.corners ?? []).map((c) => ({
      id: c.id,
      name: c.name as { en?: string; es?: string } | null,
      stake: c.stake as { en?: string; es?: string } | null,
    }));

    // Fixed order: lot name, then each corner's name and stake. Only fields
    // with English text and no Spanish yet go to the model.
    type Slot = { en: string; write: (es: string) => Promise<string | null> };
    const slots: Slot[] = [];
    if (name?.en?.trim() && !name.es?.trim()) {
      slots.push({
        en: name.en,
        write: async (es) => {
          const { error: e } = await gate
            .from("properties")
            .update({ name: { en: name.en ?? "", es } })
            .eq("id", lot.id);
          return e?.message ?? null;
        },
      });
    }
    for (const c of corners) {
      const cornerName = c.name;
      const cornerStake = c.stake;
      const needName = Boolean(cornerName?.en?.trim()) && !cornerName?.es?.trim();
      const needStake = Boolean(cornerStake?.en?.trim()) && !cornerStake?.es?.trim();
      if (!needName && !needStake) continue;
      slots.push({
        en: `${needName ? cornerName?.en ?? "" : ""}\u0001${needStake ? cornerStake?.en ?? "" : ""}`,
        write: async (es) => {
          const [esName = "", esStake = ""] = es.split("\u0001");
          const { error: e } = await gate
            .from("corners")
            .update({
              name: { en: cornerName?.en ?? "", es: needName ? esName.trim() : cornerName?.es ?? "" },
              stake: {
                en: cornerStake?.en ?? "",
                es: needStake ? esStake.trim() : cornerStake?.es ?? "",
              },
            })
            .eq("id", c.id);
          return e?.message ?? null;
        },
      });
    }

    if (slots.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      const response = await requestDrafts(client, slots.map((s) => s.en));
      const text = response.content.find((b) => b.type === "text")?.text ?? "";
      const drafts: unknown = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
      if (
        !Array.isArray(drafts) ||
        drafts.length !== slots.length ||
        !drafts.every((d) => typeof d === "string")
      ) {
        failures.push(`${lot.slug}: unexpected draft format`);
        continue;
      }
      let writeError: string | null = null;
      for (let i = 0; i < slots.length; i++) {
        writeError = (await slots[i]!.write(drafts[i] as string)) ?? writeError;
      }
      if (writeError) {
        failures.push(`${lot.slug}: ${writeError}`);
        continue;
      }
      // New ES text means a person has not read this lot's Spanish yet.
      await gate
        .from("properties")
        .update({ es_reviewed: false, es_reviewed_by: null, es_reviewed_at: null })
        .eq("id", lot.id);
      drafted += 1;
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        return {
          ok: false,
          message:
            "Anthropic rejected the API key — rotate it in Settings → Service keys, then try again.",
        };
      }
      failures.push(`${lot.slug}: ${e instanceof Error ? e.message : "draft failed"}`);
    }
  }

  revalidatePath(`/admin/properties/${masterId}`);
  const summary = `Drafted ${drafted} lot${drafted === 1 ? "" : "s"}, ${skipped} already had Spanish.`;
  if (failures.length > 0) {
    return { ok: false, message: `${summary} Failed — ${failures.join("; ")}` };
  }
  return { ok: true, message: summary };
}

export type ContentPayload = {
  nameEn: string;
  nameEs: string;
  corners: { id: string; nameEn: string; nameEs: string; stakeEn: string; stakeEs: string }[];
};

/**
 * Save paired EN/ES fields. The "reviewed by a person" flag clears only when
 * the text actually changed — hitting Save right after checking the box used
 * to silently wipe the review (reported by Alton, Nov 2026).
 */
export async function saveContent(
  propertyId: string,
  payload: ContentPayload,
): Promise<ActionResult> {
  const supabase = await createClient();

  // What's on the server now, to detect a no-op save.
  const [{ data: current }, { data: currentCorners }] = await Promise.all([
    supabase.from("properties").select("name").eq("id", propertyId).maybeSingle(),
    supabase.from("corners").select("id, name, stake").eq("property_id", propertyId),
  ]);
  const byId = new Map((currentCorners ?? []).map((c) => [c.id, c]));
  const curName = i18nText(current?.name);
  let changed = curName.en !== payload.nameEn || curName.es !== payload.nameEs;
  for (const c of payload.corners) {
    const row = byId.get(c.id);
    const rowName = i18nText(row?.name);
    const rowStake = i18nText(row?.stake);
    if (
      !row ||
      rowName.en !== c.nameEn ||
      rowName.es !== c.nameEs ||
      rowStake.en !== c.stakeEn ||
      rowStake.es !== c.stakeEs
    ) {
      changed = true;
    }
  }

  const { error: propError } = await supabase
    .from("properties")
    .update({
      name: { en: payload.nameEn, es: payload.nameEs },
      ...(changed
        ? { es_reviewed: false, es_reviewed_by: null, es_reviewed_at: null }
        : {}),
    })
    .eq("id", propertyId);
  if (propError) return { ok: false, message: propError.message };

  for (const c of payload.corners) {
    const { error } = await supabase
      .from("corners")
      .update({
        name: { en: c.nameEn, es: c.nameEs },
        stake: { en: c.stakeEn, es: c.stakeEs },
      })
      .eq("id", c.id);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  return {
    ok: true,
    message: changed
      ? "Saved — the text changed, so the Spanish needs a fresh review."
      : "Saved. Nothing changed, so the review flag stays as it is.",
  };
}

/** The human review flag that gates publish. */
export async function setEsReviewed(
  propertyId: string,
  reviewed: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("team_users")
    .select("id")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  if (!me) return { ok: false, message: "Not a team member" };

  const { error } = await supabase
    .from("properties")
    .update(
      reviewed
        ? {
            es_reviewed: true,
            es_reviewed_by: me.id,
            es_reviewed_at: new Date().toISOString(),
          }
        : { es_reviewed: false, es_reviewed_by: null, es_reviewed_at: null },
    )
    .eq("id", propertyId);
  if (error) return { ok: false, message: error.message };

  await supabase.rpc("write_audit", {
    p_action: reviewed ? "es_review_confirmed" : "es_review_cleared",
    p_property_id: propertyId,
  });

  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}
