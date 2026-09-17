import { randomBytes } from "node:crypto";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

/**
 * Walk links (plan §3 Phase 5): one public link per property plus tokenized
 * per-prospect links. Tokens gate nothing by themselves — publish status
 * does — they attribute sessions to a prospect and carry a locale for the
 * walk-pack SMS.
 */

export function newLinkToken(): string {
  return randomBytes(16).toString("base64url");
}

export function publicLinkToken(slug: string): string {
  return `public-${slug}`;
}

export function walkUrl(slug: string, token?: string | null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://greenways-jade.vercel.app";
  return token ? `${base}/walk/${slug}?t=${token}` : `${base}/walk/${slug}`;
}

/** Walk-pack SMS (copy deck `sms.walkPack`), filled per locale. */
export function walkPackSms(locale: "en" | "es", propertyName: string, url: string): string {
  const catalog = locale === "es" ? es : en;
  const template = (catalog as { sms?: { walkPack?: string } }).sms?.walkPack ?? "";
  return template.replace("{property}", propertyName).replace("{link}", url);
}
