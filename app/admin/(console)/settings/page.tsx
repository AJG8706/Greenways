import { getTranslations } from "next-intl/server";
import { ServiceKeysCard, type KeyRow } from "@/components/admin/service-keys-card";
import { kekConfigured, SERVICE_KEYS, serviceKeyStatus } from "@/lib/keys";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const t = await getTranslations("admin.nav");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("team_users")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const isAdmin = me?.role === "admin";

  const keyRows: KeyRow[] = isAdmin
    ? await Promise.all(
        (Object.keys(SERVICE_KEYS) as (keyof typeof SERVICE_KEYS)[]).map(async (name) => ({
          name,
          label: SERVICE_KEYS[name].label,
          ...(await serviceKeyStatus(name)),
        })),
      )
    : [];

  return (
    <div className="stack">
      <h1>{t("settings")}</h1>
      {isAdmin ? (
        kekConfigured() ? (
          <ServiceKeysCard rows={keyRows} />
        ) : (
          <div className="card">
            <h2>Service keys</h2>
            <p className="t-small muted">
              In-app key rotation is off until KEY_ENCRYPTION_KEY is set on the
              deployment (Vercel → Settings → Environment Variables; any long random
              string, set once). Until then, vendor keys are read from the deployment
              env as before.
            </p>
          </div>
        )
      ) : null}
      <div className="card">
        <p className="muted">
          Deployment status — these are read from the deployment&apos;s environment and
          change only with a redeploy.
        </p>
        <ul className="mt-3 grid gap-2">
          <EnvRow name="Supabase" ok={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)} />
          <EnvRow
            name="Map imagery (Mapbox token)"
            ok={Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN)}
          />
          <EnvRow name="Sentry" ok={Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)} />
        </ul>
      </div>
    </div>
  );
}

function EnvRow({ name, ok }: { name: string; ok: boolean }) {
  return (
    <li className="row between">
      <span>{name}</span>
      <span className={`pill ${ok ? "pill-live" : "pill-draft"}`}>
        {ok ? "Configured" : "Not configured"}
      </span>
    </li>
  );
}
