import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";

export default async function TeamPage() {
  const t = await getTranslations("admin.team");
  const supabase = await createClient();

  const [{ data: members }, { data: invites }, userRes] = await Promise.all([
    supabase.from("team_users").select("id, email, display_name, role, user_id").order("created_at"),
    supabase.from("invites").select("id, email, role, accepted_at, created_at").order("created_at"),
    supabase.auth.getUser(),
  ]);

  const me = (members ?? []).find((m) => m.user_id === userRes.data.user?.id);
  const isAdmin = me?.role === "admin";
  const memberEmails = new Set((members ?? []).map((m) => m.email));
  const pendingInvites = (invites ?? []).filter(
    (i) => !i.accepted_at && !memberEmails.has(i.email),
  );

  return (
    <div className="stack" style={{ gap: "var(--gw-s-6)" }}>
      <h1>{t("title")}</h1>

      <div className="table-wrap">
        <table data-testid="team-table">
          <thead>
            <tr>
              <th>{t("email")}</th>
              <th>{t("role")}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.id}>
                <td>
                  <span className="t-body-m">{m.display_name ?? m.email}</span>
                  {m.display_name ? <p className="t-small muted">{m.email}</p> : null}
                </td>
                <td>{m.role === "admin" ? t("admin") : t("editor")}</td>
                <td>
                  <span className={`pill ${m.user_id ? "pill-live" : "pill-draft"}`}>
                    {m.user_id ? t("active") : t("pending")}
                  </span>
                </td>
              </tr>
            ))}
            {pendingInvites.map((i) => (
              <tr key={i.id}>
                <td className="t-body-m">{i.email}</td>
                <td>{i.role === "admin" ? t("admin") : t("editor")}</td>
                <td>
                  <span className="pill pill-review">{t("pending")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <section className="card" style={{ maxWidth: 520 }}>
          <div className="stack">
            <h3>{t("invite")}</h3>
            <InviteForm
              labels={{
                email: t("email"),
                role: t("role"),
                admin: t("admin"),
                editor: t("editor"),
                invite: t("invite"),
              }}
            />
          </div>
        </section>
      ) : (
        <p className="t-small muted">Only admins can send invites.</p>
      )}
    </div>
  );
}
