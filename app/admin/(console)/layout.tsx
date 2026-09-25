import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { History, Home, Settings, Users } from "lucide-react";
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

  const email = teamUser?.email ?? user.email ?? "";

  const t = await getTranslations("admin.nav");
  const tTeam = await getTranslations("admin.team");

  // One markup tree, two shapes: a sticky top bar with a horizontally
  // scrollable nav on phones (spur-of-the-moment edits from the field), the
  // familiar sidebar from lg up.
  return (
    <div data-surface="light" className="gw min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside
        data-surface="walk"
        className="gw sticky top-0 z-40 flex min-w-0 flex-row items-center gap-4 overflow-x-auto px-4 py-2 lg:static lg:h-full lg:flex-col lg:items-stretch lg:gap-6 lg:overflow-hidden lg:p-5"
        style={{ background: "var(--gw-pine-2)", color: "var(--gw-prairie-cream)" }}
      >
        <Link href="/admin/properties" className="shrink-0 no-underline">
          <Image
            src="/brand/greenways-logo-horizontal-reversed.svg"
            alt="Greenways"
            width={170}
            height={40}
            priority
            className="h-auto w-[120px] lg:w-[170px]"
          />
        </Link>
        <nav
          className="flex flex-row items-center lg:flex-col lg:items-stretch"
          style={{ gap: "var(--gw-s-2)" }}
        >
          <SidebarLink href="/admin/properties" icon={<Home size={18} />}>
            {t("properties")}
          </SidebarLink>
          <SidebarLink href="/admin/team" icon={<Users size={18} />}>
            {t("team")}
          </SidebarLink>
          {teamUser?.role === "admin" ? (
            <SidebarLink href="/admin/activity" icon={<History size={18} />}>
              {t("activity")}
            </SidebarLink>
          ) : null}
          <SidebarLink href="/admin/settings" icon={<Settings size={18} />}>
            {t("settings")}
          </SidebarLink>
          <span className="ml-2 shrink-0 lg:hidden">
            <SignOutButton label={t("signOut")} />
          </span>
        </nav>
        <div
          className="mt-auto hidden panel gw-break-anywhere lg:block"
          style={{ background: "var(--gw-pine-3)", padding: "var(--gw-s-4)" }}
        >
          <div className="stack gw-break-anywhere" style={{ gap: "var(--gw-s-2)" }}>
            <strong className="gw-break-anywhere" title={email}>
              {teamUser?.display_name ?? email}
            </strong>
            <span
              className="t-small gw-break-anywhere"
              style={{ color: "var(--gw-sage-mist)" }}
              title={email}
            >
              {teamUser?.role === "admin" ? tTeam("admin") : tTeam("editor")}
            </span>
            {teamUser?.display_name ? (
              <span
                className="t-small gw-break-anywhere"
                style={{ color: "var(--gw-sage-mist)" }}
                title={email}
              >
                {email}
              </span>
            ) : null}
            <SignOutButton label={t("signOut")} />
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-4 pb-16 sm:p-6 lg:p-8">{children}</main>
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
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2 px-3 py-2 no-underline lg:gap-3"
      style={{ color: "var(--gw-prairie-cream)" }}
    >
      {icon}
      {children}
    </Link>
  );
}
