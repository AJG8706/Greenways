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
