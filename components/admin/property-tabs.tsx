"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TAB_ORDER = [
  "overview",
  "corners",
  "photos",
  "content",
  "media",
  "publish",
  "analytics",
  "demo",
] as const;

type TabKey = (typeof TAB_ORDER)[number];

export function PropertyTabs({
  propertyId,
  labels,
}: {
  propertyId: string;
  labels: Record<TabKey, string>;
}) {
  const pathname = usePathname();
  const base = `/admin/properties/${propertyId}`;

  function hrefFor(tab: TabKey) {
    return tab === "overview" ? base : `${base}/${tab}`;
  }

  function isActive(tab: TabKey) {
    const href = hrefFor(tab);
    return tab === "overview" ? pathname === base : pathname.startsWith(href);
  }

  return (
    <div className="tabs" role="tablist">
      {TAB_ORDER.map((tab) => (
        <Link
          key={tab}
          href={hrefFor(tab)}
          role="tab"
          aria-selected={isActive(tab)}
          className="tab no-underline"
          data-testid={`tab-${tab}`}
        >
          {labels[tab]}
        </Link>
      ))}
    </div>
  );
}
