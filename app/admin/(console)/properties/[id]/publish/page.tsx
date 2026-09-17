import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { walkPackSms, walkUrl } from "@/lib/links";
import { getItemName, isMondayConfigured } from "@/lib/integrations/monday";
import {
  CopyButton,
  IssueLinkForm,
  MondayCard,
  PublishToggle,
  RevokeButton,
} from "@/components/admin/publish-console";

export default async function PublishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: links }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, slug, name, status, es_reviewed, test_lot, monday_item_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("walk_links")
      .select("id, kind, token, locale, ghl_contact_id, expires_at, revoked_at, created_at")
      .eq("property_id", id)
      .eq("kind", "prospect")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (!property) notFound();

  const t = await getTranslations("admin.publish");
  const published = property.status === "published";
  const name = i18nText(property.name);
  const publicUrl = walkUrl(property.slug);
  const qrSvg = await QRCode.toString(publicUrl, {
    type: "svg",
    margin: 1,
    color: { dark: "#24301F", light: "#F5F3E9" },
  });
  const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;
  const mondayOn = isMondayConfigured();
  const mondayItemName =
    mondayOn && property.monday_item_id ? await getItemName(property.monday_item_id) : null;

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2>{t("title")}</h2>
        <span
          className={`pill ${published ? "pill-live" : "pill-draft"}`}
          data-testid="publish-status"
        >
          {published ? t("published") : t("draft")}
        </span>
      </div>

      {!property.es_reviewed ? (
        <div className="banner banner-warn" role="status" data-testid="publish-blocked">
          {t("blockedEs")}
        </div>
      ) : null}
      {property.test_lot ? (
        <div className="banner banner-warn" role="status">
          {t("blockedTestLot")}
        </div>
      ) : null}

      <PublishToggle
        propertyId={id}
        published={published}
        labels={{ publish: t("publishCta"), unpublish: t("unpublish") }}
      />

      <section className="card stack" style={{ gap: "var(--gw-s-3)" }}>
        <h3>{t("publicLink")}</h3>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <code className="t-small" style={{ wordBreak: "break-all" }} data-testid="public-url">
            {publicUrl}
          </code>
          <CopyButton text={publicUrl} labels={{ copy: t("copy"), copied: t("copied") }} />
        </div>
        {!published ? <p className="t-small muted">{t("linkHint")}</p> : null}
        <div className="row" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div className="stack" style={{ gap: 6 }}>
            <span className="t-label">{t("qr")}</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI */}
            <img src={qrDataUri} alt={t("qr")} width={160} height={160} data-testid="qr-image" />
            <a href={qrDataUri} download={`${property.slug}-qr.svg`} className="t-small">
              {t("download")}
            </a>
          </div>
          <div className="stack grow" style={{ gap: 6, minWidth: 240, flex: "1 1 240px" }}>
            <span className="t-label">{t("smsSnippet")} · EN</span>
            <p className="t-small muted">{walkPackSms("en", name.en || property.slug, publicUrl)}</p>
            <CopyButton
              text={walkPackSms("en", name.en || property.slug, publicUrl)}
              labels={{ copy: t("copy"), copied: t("copied") }}
            />
            <span className="t-label">{t("smsSnippet")} · ES</span>
            <p className="t-small muted">
              {walkPackSms("es", name.es || name.en || property.slug, publicUrl)}
            </p>
            <CopyButton
              text={walkPackSms("es", name.es || name.en || property.slug, publicUrl)}
              labels={{ copy: t("copy"), copied: t("copied") }}
            />
          </div>
        </div>
      </section>

      {mondayOn ? (
        <MondayCard
          propertyId={id}
          linkedItemId={property.monday_item_id}
          linkedItemName={mondayItemName}
          labels={{
            title: t("monday.title"),
            hint: t("monday.hint"),
            pick: t("monday.pick"),
            load: t("monday.load"),
            save: t("monday.save"),
            sync: t("monday.sync"),
            unlink: t("monday.unlink"),
            linked: t("monday.linked"),
            synced: t("monday.synced"),
          }}
        />
      ) : null}

      <section className="card stack" style={{ gap: "var(--gw-s-3)" }}>
        <div>
          <h3>{t("prospectLinks")}</h3>
          <p className="t-small muted">{t("prospectHint")}</p>
        </div>
        <IssueLinkForm
          propertyId={id}
          labels={{
            issue: t("issue"),
            locale: t("locale"),
            contact: t("contact"),
            expires: t("expiresDays"),
          }}
        />
        {(links ?? []).length === 0 ? (
          <p className="t-small muted" data-testid="no-prospect-links">
            {t("noLinks")}
          </p>
        ) : (
          <div className="table-wrap">
            <table data-testid="prospect-links">
              <tbody>
                {(links ?? []).map((l) => {
                  const url = walkUrl(property.slug, l.token);
                  const expired =
                    l.expires_at !== null && new Date(l.expires_at).getTime() < Date.now();
                  return (
                    <tr key={l.id}>
                      <td className="t-small" style={{ wordBreak: "break-all" }}>
                        <code>{url}</code>
                      </td>
                      <td className="t-small">{(l.locale ?? "en").toUpperCase()}</td>
                      <td className="t-small muted">{l.ghl_contact_id ?? "—"}</td>
                      <td className="t-small muted">
                        {l.revoked_at
                          ? t("revoked")
                          : expired
                            ? t("expired")
                            : l.expires_at
                              ? new Date(l.expires_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "—"}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <CopyButton text={url} labels={{ copy: t("copy"), copied: t("copied") }} />
                        {!l.revoked_at ? (
                          <RevokeButton propertyId={id} linkId={l.id} label={t("revoke")} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
