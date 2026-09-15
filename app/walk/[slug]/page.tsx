import { getTranslations } from "next-intl/server";
import { LanguageToggle } from "@/components/walk/language-toggle";

// Buyer walk shell — the real HUD arrives in Phase 3. This placeholder proves the
// dark walk surface + cookie locale end-to-end. Every string comes from messages.
export default async function WalkPage() {
  const t = await getTranslations();

  return (
    <main
      data-surface="walk"
      className="gw flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <p className="t-label">{t("welcome.eyebrow")}</p>
      <h1 className="t-display" style={{ color: "var(--heading)" }}>
        {t("welcome.title")}
      </h1>
      <p className="max-w-sm" style={{ color: "var(--text-2)" }}>
        {t("welcome.body")}
      </p>
      <p className="t-small" style={{ color: "var(--text-2)" }}>
        {t("welcome.loadHint")}
      </p>
    </main>
  );
}
