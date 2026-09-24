import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageToggle } from "@/components/walk/language-toggle";
import type { I18nText } from "@/lib/i18n/text";

export type PickerLot = {
  slug: string;
  name: I18nText;
  acres: number | null;
  saleStatus: "available" | "under_contract" | "sold";
};

/**
 * Master-tract landing: the QR on the sign at the gate opens this picker,
 * and the buyer chooses which lot to walk. Only lots that are individually
 * walkable (published, locked corners) are listed — a sold lot shows its
 * badge but doesn't link.
 */
export async function LotPicker({
  masterName,
  locale,
  lots,
}: {
  masterName: I18nText;
  locale: string;
  lots: PickerLot[];
}) {
  const t = await getTranslations("lots");
  const name = locale === "es" && masterName.es ? masterName.es : masterName.en;

  return (
    <main
      className="gw relative mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-8"
      data-surface="walk"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <Image
        src="/brand/greenways-logo-stacked-reversed.svg"
        alt="Greenways"
        width={140}
        height={105}
        className="mx-auto"
        priority
      />
      <div className="text-center">
        <p className="t-label">{t("eyebrow")}</p>
        <h1 style={{ font: "var(--gw-t-h1)" }}>{name}</h1>
      </div>
      <h2 className="text-center" style={{ font: "var(--gw-t-h2)", color: "var(--heading)" }}>
        {t("title")}
      </h2>
      <p className="muted text-center">{t("body")}</p>

      {lots.length === 0 ? (
        <p className="muted text-center" data-testid="lots-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="stack" style={{ gap: "var(--gw-s-3)" }} data-testid="lot-picker">
          {lots.map((lot) => {
            const lotName = locale === "es" && lot.name.es ? lot.name.es : lot.name.en;
            const sold = lot.saleStatus === "sold";
            const badge =
              lot.saleStatus === "available"
                ? { className: "pill-available", label: t("available") }
                : lot.saleStatus === "under_contract"
                  ? { className: "pill-contract", label: t("underContract") }
                  : { className: "pill-sold", label: t("sold") };
            const body = (
              <span className="row between" style={{ width: "100%" }}>
                <span className="stack" style={{ gap: 2, textAlign: "left" }}>
                  <span className="t-body-m">{lotName}</span>
                  {lot.acres !== null ? (
                    <span className="t-small muted">
                      {t("acres", { n: lot.acres })}
                    </span>
                  ) : null}
                </span>
                <span className={`pill ${badge.className}`}>{badge.label}</span>
              </span>
            );
            return (
              <li key={lot.slug}>
                {sold ? (
                  <span
                    className="corner-tile"
                    style={{ opacity: 0.6, cursor: "default" }}
                    data-testid={`lot-${lot.slug}`}
                  >
                    {body}
                  </span>
                ) : (
                  <Link
                    href={`/walk/${lot.slug}`}
                    className="corner-tile"
                    style={{ textDecoration: "none" }}
                    data-testid={`lot-${lot.slug}`}
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
