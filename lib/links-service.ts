import "server-only";

import { newLinkToken, walkPackSms, walkUrl } from "@/lib/links";
import { i18nText } from "@/lib/i18n/text";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Prospect-link issuance shared by the n8n webhook (/api/links/issue) and
 * the public API (/api/v1/properties/{slug}/links) — one implementation,
 * two front doors.
 */
export type IssueResult =
  | {
      ok: true;
      url: string;
      token: string;
      expires_at: string;
      published: boolean;
      sms: { en: string; es: string };
    }
  | { ok: false; status: number; error: string };

export async function issueProspectLinkForSlug(input: {
  slug: string;
  ghlContactId?: string;
  locale?: string;
  expiresDays?: number;
}): Promise<IssueResult> {
  const locale = input.locale === "es" ? "es" : "en";
  const supabase = createAdminClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, slug, name, status")
    .eq("slug", input.slug)
    .maybeSingle();
  if (!property) return { ok: false, status: 404, error: "unknown property" };

  const days = Math.min(Math.max(Math.round(input.expiresDays ?? 30), 1), 365);
  const token = newLinkToken();
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
  const { error } = await supabase.from("walk_links").insert({
    property_id: property.id,
    kind: "prospect",
    token,
    locale,
    ghl_contact_id: input.ghlContactId?.trim() || null,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, status: 500, error: error.message };

  const url = walkUrl(property.slug, token);
  const name = i18nText(property.name);
  return {
    ok: true,
    url,
    token,
    expires_at: expiresAt,
    published: property.status === "published",
    sms: {
      en: walkPackSms("en", name.en || property.slug, url),
      es: walkPackSms("es", name.es || name.en || property.slug, url),
    },
  };
}
