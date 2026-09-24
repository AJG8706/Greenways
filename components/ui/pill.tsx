import { cn } from "@/lib/utils";

type PillTone =
  | "draft"
  | "working"
  | "review"
  | "live"
  | "error"
  | "available"
  | "contract"
  | "sold";

export function Pill({
  tone,
  className,
  children,
}: {
  tone: PillTone;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cn("pill", `pill-${tone}`, className)}>{children}</span>;
}

export const statusTone: Record<string, PillTone> = {
  draft: "draft",
  generating: "working",
  review: "review",
  published: "live",
  error: "error",
};

export type SaleStatus = "available" | "under_contract" | "sold";

// Lives here (no "use client") so server components get the real object.
// Imported from a client module, it becomes a client reference and every
// lookup silently returns undefined — pills render as pill-undefined.
export const saleTone: Record<SaleStatus, PillTone> = {
  available: "available",
  under_contract: "contract",
  sold: "sold",
};
