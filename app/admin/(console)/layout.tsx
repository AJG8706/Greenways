import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Home, Settings, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/admin/sign-out-button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const { data: teamUser } = await supabase
    .from("team_users")
    .select("display_name, email, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const t = await getTranslations("admin.nav");
  const tTeam = await getTranslations("admin.team");

  return (
    <div data-surface="light" className="gw grid min-h-dvh grid-cols-[240px_1fr]">
      <aside
        data-surface="walk"
        className="gw flex flex-col gap-6 p-5"
        style={{ background: "var(--gw-pine-2)", color: "var(--gw-prairie-cream)" }}
      >
        <Link href="/admin/properties" className="no-underline">
          <Image
            src="/brand/greenways-logo-horizontal-reversed.svg"
            alt="Greenways"
            width={170}
            height={40}
            priority
          />
        </Link>
        <nav className="stack" style={{ gap: "var(--gw-s-2)" }}>
          <SidebarLink href="/admin/properties" icon={<Home size={18} />}>
            {t("properties")}
          </SidebarLink>
          <SidebarLink href="/admin/team" icon={<Users size={18} />}>
            {t("team")}
          </SidebarLink>
          <SidebarLink href="/admin/settings" icon={<Settings size={18} />}>
            {t("settings")}
          </SidebarLink>
        </nav>
        <div className="mt-auto panel" style={{ background: "var(--gw-pine-3)" }}>
          <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
            <strong>{teamUser?.display_name ?? teamUser?.email ?? user.email}</strong>
            <span className="t-small" style={{ color: "var(--gw-sage-mist)" }}>
              {teamUser?.role === "admin" ? tTeam("admin") : tTeam("editor")} ·{" "}
              {teamUser?.email ?? user.email}
            </span>
            <SignOutButton label={t("signOut")} />
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-8">{children}</main>
    </div>
  );
}

function SidebarLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2 px-3 py-2 no-underline"
      style={{ color: "var(--gw-prairie-cream)" }}
    >
      {icon}
      {children}
    </Link>
  );
}
