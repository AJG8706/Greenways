import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { walkUrl } from "@/lib/links";
import { PrintButton } from "./print-button";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

export const dynamic = "force-dynamic";

/**
 * Print-ready gate sign: brand-styled letter page with the walk QR. For a
 * master the QR opens the lot picker; for a standalone lot, its walk. The
 * sign itself is buyer-facing print, so both languages render side by side
 * (strings from both catalogs — guardrail #6).
 */
export default async function GateSignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, slug, name, acres")
    .eq("id", id)
    .maybeSingle();
  if (!property) notFound();

  const { count: lotCount } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);
  const isMaster = (lotCount ?? 0) > 0;

  const url = walkUrl(property.slug);
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    color: { dark: "#24301F", light: "#F5F3E9" },
  });
  const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;
  const name = i18nText(property.name).en || property.slug;
  const signEn = (en as { sign: Record<string, string> }).sign;
  const signEs = (es as { sign: Record<string, string> }).sign;
  const scanEn = isMaster ? signEn.scanLots : signEn.scanWalk;
  const scanEs = isMaster ? signEs.scanLots : signEs.scanWalk;

  return (
    <main
      className="gw mx-auto flex min-h-dvh max-w-2xl flex-col items-center gap-6 px-8 py-10 text-center"
      data-surface="light"
      style={{ background: "var(--gw-prairie-cream)", color: "var(--text)" }}
    >
      <style>{`
        @page { size: letter portrait; margin: 0.5in; }
        @media print { .no-print { display: none !important; } }
      `}</style>
      <div className="no-print">
        <PrintButton />
      </div>
      <Image
        src="/brand/greenways-logo-horizontal.svg"
        alt="Greenways"
        width={280}
        height={84}
        priority
      />
      <div>
        <h1 style={{ font: "var(--gw-t-display)", color: "var(--gw-pasture-green)" }}>{name}</h1>
        {property.acres !== null ? (
          <p className="t-body-m muted">{Number(property.acres)} acres</p>
        ) : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI */}
      <img src={qrDataUri} alt="QR" width={380} height={380} data-testid="sign-qr" />
      <div className="stack" style={{ gap: 4 }}>
        <p style={{ font: "var(--gw-t-h2)", color: "var(--gw-pasture-green)" }}>{scanEn}</p>
        <p className="t-body-m muted">{scanEs}</p>
      </div>
      <div className="stack" style={{ gap: 2 }}>
        <p className="t-small muted">{signEn.hint}</p>
        <p className="t-small muted">{signEs.hint}</p>
      </div>
      <p className="t-small" style={{ color: "var(--gw-sage-ink)", wordBreak: "break-all" }}>
        {url.replace(/^https?:\/\//, "")}
      </p>
    </main>
  );
}
