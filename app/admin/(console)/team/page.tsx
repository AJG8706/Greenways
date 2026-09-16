import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { ResendInviteButton } from "./resend-button";

export default async function TeamPage() {
  const t = await getTranslations("admin.team");
  const supabase = await createClient();

  const [{ data: members }, { data: invites }, userRes] = await Promise.all([
    supabase
      .from("team_users")
      .select("id, email, display_name, role, user_id, first_signed_in_at")
      .order("created_at"),
    supabase
      .from("invites")
      .select("id, email, role, accepted_at, created_at, last_sent_at")
      .order("created_at"),
    supabase.auth.getUser(),
  ]);

  const me = (members ?? []).find((m) => m.user_id === userRes.data.user?.id);
  const isAdmin = me?.role === "admin";
  const memberEmails = new Set((members ?? []).map((m) => m.email));
  const pendingInvites = (invites ?? []).filter(
    (i) => !i.accepted_at && !memberEmails.has(i.email),
  );
  const inviteByEmail = new Map((invites ?? []).map((i) => [i.email, i]));

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
              {isAdmin ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => {
              const active = m.first_signed_in_at !== null;
              const lastSent = inviteByEmail.get(m.email)?.last_sent_at;
              return (
                <tr key={m.id}>
                  <td>
                    <span className="t-body-m">{m.display_name ?? m.email}</span>
                    {m.display_name ? <p className="t-small muted">{m.email}</p> : null}
                  </td>
                  <td>{m.role === "admin" ? t("admin") : t("editor")}</td>
                  <td>
                    <span className={`pill ${active ? "pill-live" : "pill-draft"}`}>
                      {active ? t("active") : t("pending")}
                    </span>
                    {!active && lastSent ? (
                      <p className="t-small muted">
                        {t("lastSent")}{" "}
                        {new Date(lastSent).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    ) : null}
                  </td>
                  {isAdmin ? (
                    <td style={{ textAlign: "right" }}>
                      {!active ? (
                        <ResendInviteButton
                          email={m.email}
                          label={t("resend")}
                          sentLabel={t("sent")}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {pendingInvites.map((i) => (
              <tr key={i.id}>
                <td className="t-body-m">{i.email}</td>
                <td>{i.role === "admin" ? t("admin") : t("editor")}</td>
                <td>
                  <span className="pill pill-review">{t("pending")}</span>
                  {i.last_sent_at ? (
                    <p className="t-small muted">
                      {t("lastSent")}{" "}
                      {new Date(i.last_sent_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  ) : null}
                </td>
                {isAdmin ? (
                  <td style={{ textAlign: "right" }}>
                    <ResendInviteButton
                      email={i.email}
                      label={i.last_sent_at ? t("resend") : t("sendInvite")}
                      sentLabel={t("sent")}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <section className="card" style={{ maxWidth: 520 }}>
          <div className="stack">
            <h3>{t("invite")}</h3>
            <p className="t-small muted">{t("inviteHint")}</p>
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
