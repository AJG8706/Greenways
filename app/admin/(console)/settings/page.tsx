import { getTranslations } from "next-intl/server";

export default async function SettingsPage() {
  const t = await getTranslations("admin.nav");

  return (
    <div className="stack">
      <h1>{t("settings")}</h1>
      <div className="card">
        <p className="muted">
          Environment status — keys are read from the deployment, never stored here.
        </p>
        <ul className="mt-3 grid gap-2">
          <EnvRow name="Supabase" ok={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)} />
          <EnvRow
            name="Map imagery (Mapbox token)"
            ok={Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN)}
          />
          <EnvRow
            name="Anthropic (Draft Spanish helper)"
            ok={Boolean(process.env.ANTHROPIC_API_KEY)}
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
