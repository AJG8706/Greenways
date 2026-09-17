import type { I18nText } from "@/lib/i18n/text";
import type { LatLng } from "@/lib/geo/types";
import type { WalkerScenario } from "@/lib/hud/walker";

/** Everything the buyer walk needs, resolved server-side. */
export type WalkCorner = {
  id: string;
  n: number;
  lat: number;
  lng: number;
  name: I18nText;
  stake: I18nText;
  /** Signed URL for the stake close-up, when uploaded. */
  stakePhotoUrl: string | null;
};

export type WalkConfig = {
  slug: string;
  name: I18nText;
  acres: number | null;
  corners: WalkCorner[];
  entrance: LatLng;
  /**
   * Magnetic declination at the property (degrees east positive). Android
   * headings are magnetic; add this to get true (HUD spec §1). Constant per
   * property for now — Beaumont ≈ +1.5°E in 2026.
   */
  declinationDeg: number;
  /** Demo scenario when launched from the admin Demo tab; null in the field. */
  demo: (WalkerScenario & { key: string }) | null;
  /** Valid prospect-link token from the URL; sessions attribute to it. */
  linkToken: string | null;
  /** Browser key for the Google satellite mini-map; drawn fallback when null. */
  googleKey: string | null;
  /**
   * Approved walkthrough clips (guardrail #3: only status='approved' assets
   * ever reach a buyer), as signed URLs. Null slots simply don't play —
   * media never blocks the HUD.
   */
  media: WalkMedia;
};

export type WalkMedia = {
  intro: string | null;
  entrance: string | null;
  homesite: string | null;
  /** Corner number → approach clip URL. */
  corners: Record<number, string>;
};
