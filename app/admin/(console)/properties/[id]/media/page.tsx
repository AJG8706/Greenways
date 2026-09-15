import { getTranslations } from "next-intl/server";
import { StubTab } from "@/components/admin/stub-tab";

export default async function MediaPage() {
  const t = await getTranslations("admin.media");
  return (
    <StubTab
      phase="Phase 4"
      title={t("title")}
      body={`${t("realityRule")} The Higgsfield generation queue and side-by-side review land in Phase 4.`}
    />
  );
}
