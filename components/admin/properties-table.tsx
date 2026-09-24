"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import type { PillTone } from "@/components/ui/pill";

export type ListRow = {
  id: string;
  name: string;
  county: string | null;
  cornersLabel: string;
  statusTone: PillTone;
  statusLabel: string;
  modeDemo: boolean;
  modeLabel: string;
  testLotLabel: string | null;
  saleTone: PillTone;
  saleLabel: string;
  updatedLabel: string;
  lots: ListRow[];
};

const OPEN_KEY = "gw-masters-open";

/**
 * Grouped, collapsible property list: a master row carries a chevron and its
 * lot count; lots render indented when expanded. Collapsed by default —
 * which masters are open is a per-viewer convenience kept in localStorage.
 */
export function PropertiesTable({
  rows,
  labels,
}: {
  rows: ListRow[];
  labels: { master: string; lotCount: string };
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(OPEN_KEY);
      if (stored) setOpen(new Set(JSON.parse(stored) as string[]));
    } catch {
      // storage unavailable — everything starts collapsed
    }
  }, []);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable — state lasts for the session
      }
      return next;
    });
  }

  function renderRow(row: ListRow, isLot: boolean) {
    const isMaster = row.lots.length > 0;
    return (
      <tr key={row.id} data-lot={isLot ? "true" : undefined}>
        <td>
          <span className="row" style={{ gap: 6, paddingLeft: isLot ? "var(--gw-s-5)" : 0 }}>
            {isLot ? (
              <span aria-hidden className="muted">
                ↳
              </span>
            ) : null}
            {isMaster ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "0 4px", minHeight: 24 }}
                onClick={() => toggle(row.id)}
                aria-expanded={open.has(row.id)}
                data-testid={`toggle-master-${row.id}`}
              >
                {open.has(row.id) ? (
                  <ChevronDown size={16} aria-hidden />
                ) : (
                  <ChevronRight size={16} aria-hidden />
                )}
              </button>
            ) : null}
            <Link href={`/admin/properties/${row.id}`} className="t-body-m">
              {row.name}
            </Link>
            {isMaster ? (
              <Pill tone="draft">
                {labels.master} · {row.lots.length} {labels.lotCount}
              </Pill>
            ) : null}
          </span>
        </td>
        <td>{row.county ?? "—"}</td>
        <td className="num">{row.cornersLabel}</td>
        <td>
          <Pill tone={row.statusTone}>{row.statusLabel}</Pill>
        </td>
        <td>
          <Pill tone={row.modeDemo ? "working" : "available"}>{row.modeLabel}</Pill>
          {row.testLotLabel ? (
            <Pill tone="draft" className="ml-2">
              {row.testLotLabel}
            </Pill>
          ) : null}
        </td>
        <td>
          <Pill tone={row.saleTone}>{row.saleLabel}</Pill>
        </td>
        <td className="num">{row.updatedLabel}</td>
      </tr>
    );
  }

  return (
    <tbody>
      {rows.flatMap((row) => [
        renderRow(row, false),
        ...(open.has(row.id) ? row.lots.map((lot) => renderRow(lot, true)) : []),
      ])}
    </tbody>
  );
}
