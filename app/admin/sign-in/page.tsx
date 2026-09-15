import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("admin.signIn");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="card w-full max-w-md" style={{ boxShadow: "var(--shadow-2)" }}>
        <div className="stack">
          <Image
            src="/brand/greenways-logo-horizontal.svg"
            alt="Greenways"
            width={200}
            height={48}
            priority
          />
          <h1>{t("title")}</h1>
          <p className="muted">{t("body")}</p>
          {error === "link" ? (
            <div className="banner banner-error" role="alert">
              The sign-in link expired or was already used. Request a new one.
            </div>
          ) : null}
          <SignInForm />
        </div>
      </div>
    </main>
  );
}
