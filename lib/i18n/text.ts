import type { Json } from "@/lib/supabase/database.types";

/** Paired EN/ES free text stored as jsonb (guardrail #6). */
export type I18nText = { en: string; es: string };

export function i18nText(value: Json | null | undefined): I18nText {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    return {
      en: typeof v.en === "string" ? v.en : "",
      es: typeof v.es === "string" ? v.es : "",
    };
  }
  return { en: "", es: "" };
}
