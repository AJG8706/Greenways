import { getTranslations } from "next-intl/server";
import { StubTab } from "@/components/admin/stub-tab";

export default async function AnalyticsPage() {
  const t = await getTranslations("admin.analytics");
  return (
    <StubTab
      phase="Phase 5"
      title={t("title")}
      body="Walk sessions, corners found, time-to-corner, boundary exits and compass problems appear here once buyers are walking (Phase 5)."
    />
  );
}
