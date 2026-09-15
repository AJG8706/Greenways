"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../../actions";

/**
 * "Draft Spanish" helper (guardrail #6): AI drafts, a person reviews.
 * Optional via ANTHROPIC_API_KEY; drafts always land unreviewed.
 */
export async function draftSpanish(
  texts: string[],
): Promise<{ ok: boolean; drafts?: string[]; message?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, message: "ANTHROPIC_API_KEY is not configured" };
  }
  const nonEmpty = texts.map((t) => t.trim());
  if (nonEmpty.every((t) => !t)) {
    return { ok: false, message: "Write the English text first" };
  }

  const client = new Anthropic();
  const response = await client.messages.create({
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

export type ContentPayload = {
  nameEn: string;
  nameEs: string;
  corners: { id: string; nameEn: string; nameEs: string; stakeEn: string; stakeEs: string }[];
};

/** Save paired EN/ES fields. Any save clears the "reviewed by a person" flag. */
export async function saveContent(
  propertyId: string,
  payload: ContentPayload,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: propError } = await supabase
    .from("properties")
    .update({
      name: { en: payload.nameEn, es: payload.nameEs },
      es_reviewed: false,
      es_reviewed_by: null,
      es_reviewed_at: null,
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
  return { ok: true };
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
