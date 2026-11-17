// Weekly digest composition: pure, so the endpoint and tests share one truth.

export type DigestRow = {
  name: string;
  walks: number;
  completed: number;
  interested: number;
  loved: number;
};

/**
 * One SMS-sized plain-text digest. Quiet properties are dropped; the
 * busiest lead, and the text caps itself so GHL's SMS step never splits
 * into a paragraph storm.
 */
export function composeDigestText(rows: readonly DigestRow[], periodLabel: string): string {
  const active = rows
    .filter((r) => r.walks > 0 || r.interested > 0)
    .sort((a, b) => b.walks - a.walks || b.interested - a.interested);
  const totals = active.reduce(
    (acc, r) => ({
      walks: acc.walks + r.walks,
      completed: acc.completed + r.completed,
      interested: acc.interested + r.interested,
      loved: acc.loved + r.loved,
    }),
    { walks: 0, completed: 0, interested: 0, loved: 0 },
  );

  if (active.length === 0) {
    return `Greenways ${periodLabel}: no walks this week.`;
  }

  const head =
    `Greenways ${periodLabel}: ${totals.walks} walk${totals.walks === 1 ? "" : "s"}, ` +
    `${totals.completed} completed, ${totals.interested} interested` +
    (totals.loved > 0 ? `, ${totals.loved} loved it` : "") +
    ".";

  const lines: string[] = [];
  for (const r of active.slice(0, 8)) {
    const bits = [`${r.walks}w`];
    if (r.completed > 0) bits.push(`${r.completed}✓`);
    if (r.interested > 0) bits.push(`${r.interested} interested`);
    if (r.loved > 0) bits.push(`${r.loved}♥`);
    lines.push(`${r.name}: ${bits.join(" · ")}`);
  }
  if (active.length > 8) lines.push(`+${active.length - 8} more`);

  return [head, ...lines].join("\n").slice(0, 900);
}
