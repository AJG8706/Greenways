"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE } from "@/lib/i18n/config";

// One-tap EN/ES toggle, always visible on buyer screens (locked decision).
// Cookie locale, no path prefix — the same link serves both languages.
export function LanguageToggle() {
  const t = useTranslations("common");
  const router = useRouter();

  function toggle() {
    const next = t("switchLanguageShort") === "ES" ? "es" : "en";
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="hud-chip"
      style={{ minWidth: 40 }}
      aria-label={t("switchLanguage")}
    >
      {t("switchLanguageShort")}
    </button>
  );
}
