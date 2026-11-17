import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Opt-in automation toggles (Settings → Automations). Stored in
 * app_settings (service-role only); everything defaults OFF, and a
 * missing table (migration gap on a preview) reads as OFF too, so the
 * endpoints degrade to no-ops instead of erroring.
 */
export type AutomationSettings = {
  digestEnabled: boolean;
  noshowEnabled: boolean;
  /** Days a prospect link may sit unopened before the nudge. */
  noshowDays: number;
  /** False when app_settings is unreadable (not migrated yet). */
  migrated: boolean;
};

export const AUTOMATION_DEFAULTS: AutomationSettings = {
  digestEnabled: false,
  noshowEnabled: false,
  noshowDays: 3,
  migrated: true,
};

export async function getAutomationSettings(): Promise<AutomationSettings> {
  try {
    const { data, error } = await createAdminClient()
      .from("app_settings")
      .select("key, value")
      .in("key", ["weekly_digest", "noshow_nudges"]);
    if (error) return { ...AUTOMATION_DEFAULTS, migrated: false };
    const byKey = new Map((data ?? []).map((r) => [r.key, r.value as Record<string, unknown>]));
    const digest = byKey.get("weekly_digest") ?? {};
    const noshow = byKey.get("noshow_nudges") ?? {};
    const days = Number(noshow.days);
    return {
      digestEnabled: digest.enabled === true,
      noshowEnabled: noshow.enabled === true,
      noshowDays: Number.isFinite(days) && days >= 1 && days <= 30 ? Math.round(days) : 3,
      migrated: true,
    };
  } catch {
    return { ...AUTOMATION_DEFAULTS, migrated: false };
  }
}

export async function setAppSetting(
  key: "weekly_digest" | "noshow_nudges",
  value: Record<string, unknown>,
  updatedBy: string | null,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({
      key,
      value: value as Json,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    });
  if (error) {
    return {
      ok: false,
      message: /app_settings/.test(error.message)
        ? "The automations migration (20261117100000) has not reached the database yet — run the DB push workflow, then retry."
        : error.message,
    };
  }
  return { ok: true };
}
