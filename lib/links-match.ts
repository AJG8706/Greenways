/**
 * Resolve a GHL `area_of_interest` string to a property — pure, so Vitest
 * covers it. The field is canonicalized upstream (the n8n Property Info
 * Resolver writes canonical names), but spellings still drift from the
 * Greenways name/slug/address, so matching is normalized text, not equality
 * on one field.
 *
 * Ranking: exact normalized match on name, slug, or address wins; then
 * containment either way (a master's name is contained in its lots' names,
 * so equality-first keeps "CR 4800 Warren" on the master, not Lot 3).
 * Ties prefer a master (parent_id null) over a lot, published over not.
 */
export type MatchableProperty = {
  id: string;
  slug: string;
  nameEn: string;
  address: string | null;
  parentId: string | null;
  published: boolean;
};

export function normalizeArea(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function keys(p: MatchableProperty): string[] {
  return [p.nameEn, p.slug, p.address ?? ""]
    .map(normalizeArea)
    .filter((k) => k.length > 0);
}

/** Lower is better; used only to break ties between equal-rank matches. */
function tieBreak(p: MatchableProperty): number {
  return (p.parentId === null ? 0 : 1) + (p.published ? 0 : 2);
}

export function matchPropertyByArea(
  properties: MatchableProperty[],
  area: string,
): MatchableProperty | null {
  const needle = normalizeArea(area);
  if (needle.length < 3) return null;

  const exact = properties
    .filter((p) => keys(p).some((k) => k === needle))
    .sort((a, b) => tieBreak(a) - tieBreak(b));
  if (exact.length > 0) return exact[0]!;

  // Containment both ways, but only on strings long enough to mean something.
  let best: { p: MatchableProperty; score: number } | null = null;
  for (const p of properties) {
    for (const k of keys(p)) {
      if (k.length < 6) continue;
      let score = 0;
      if (needle.includes(k)) score = k.length / needle.length;
      else if (k.includes(needle) && needle.length >= 6) score = needle.length / k.length;
      if (score === 0) continue;
      if (
        !best ||
        score > best.score ||
        (score === best.score && tieBreak(p) < tieBreak(best.p))
      ) {
        best = { p, score };
      }
    }
  }
  return best?.p ?? null;
}
