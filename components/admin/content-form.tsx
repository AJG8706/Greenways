"use client";

import { useState, useTransition } from "react";
import { Languages } from "lucide-react";
import {
  draftSpanish,
  saveContent,
  setEsReviewed,
} from "@/app/admin/(console)/properties/[id]/content/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import type { I18nText } from "@/lib/i18n/text";

type CornerContent = { id: string; n: number; name: I18nText; stake: I18nText };

export function ContentForm({
  propertyId,
  name,
  corners,
  esReviewed,
  esReviewedBy,
  esReviewedAt,
  anthropicConfigured,
  labels,
}: {
  propertyId: string;
  name: I18nText;
  corners: CornerContent[];
  esReviewed: boolean;
  esReviewedBy: string | null;
  esReviewedAt: string | null;
  anthropicConfigured: boolean;
  labels: {
    title: string;
    en: string;
    es: string;
    draftEs: string;
    reviewNote: string;
    displayName: string;
    stake: string;
  };
}) {
  const [form, setForm] = useState(() => ({
    nameEn: name.en,
    nameEs: name.es,
    corners: corners.map((c) => ({
      id: c.id,
      n: c.n,
      nameEn: c.name.en,
      nameEs: c.name.es,
      stakeEn: c.stake.en,
      stakeEs: c.stake.es,
    })),
  }));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function drafts() {
    setMessage(null);
    startTransition(async () => {
      // One call drafts every ES field from its EN pair, in order.
      const texts = [
        form.nameEn,
        ...form.corners.flatMap((c) => [c.nameEn, c.stakeEn]),
      ];
      const result = await draftSpanish(texts);
      if (!result.ok || !result.drafts) {
        setMessage({ kind: "error", text: result.message ?? "Draft failed" });
        return;
      }
      const [nameEs, ...rest] = result.drafts;
      setForm((f) => ({
        ...f,
        nameEs: f.nameEs || (nameEs ?? ""),
        corners: f.corners.map((c, i) => ({
          ...c,
          nameEs: c.nameEs || (rest[i * 2] ?? ""),
          stakeEs: c.stakeEs || (rest[i * 2 + 1] ?? ""),
        })),
      }));
      setMessage({ kind: "ok", text: labels.reviewNote });
    });
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveContent(propertyId, form);
      setMessage(
        result.ok
          ? { kind: "ok", text: "Saved. Spanish needs a person's review before publish." }
          : { kind: "error", text: result.message ?? "Save failed" },
      );
    });
  }

  function toggleReviewed(next: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await setEsReviewed(propertyId, next);
      if (!result.ok) setMessage({ kind: "error", text: result.message ?? "Failed" });
    });
  }

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <div className="row between">
        <h2>{labels.title}</h2>
        <div className="row">
          <Button
            variant="secondary"
            onClick={drafts}
            disabled={pending || !anthropicConfigured}
            title={anthropicConfigured ? undefined : "ANTHROPIC_API_KEY not configured"}
            data-testid="draft-spanish"
          >
            <Languages size={16} /> {labels.draftEs}
          </Button>
          <Button onClick={save} disabled={pending} data-testid="save-content">
            Save
          </Button>
        </div>
      </div>

      {message ? (
        <div
          className={`banner ${message.kind === "error" ? "banner-error" : ""}`}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </div>
      ) : null}

      <section className="card">
        <div className="stack">
          <h3>{labels.displayName}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              {labels.en}
              <Input
                value={form.nameEn}
                onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
              />
            </label>
            <label className="field">
              {labels.es}
              <Input
                value={form.nameEs}
                onChange={(e) => setForm((f) => ({ ...f, nameEs: e.target.value }))}
              />
            </label>
          </div>
        </div>
      </section>

      {form.corners.map((c, i) => (
        <section className="card" key={c.id}>
          <div className="stack">
            <h3>C{c.n}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="field">
                Corner name · {labels.en}
                <Input
                  value={c.nameEn}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      corners: f.corners.map((x, j) =>
                        j === i ? { ...x, nameEn: e.target.value } : x,
                      ),
                    }))
                  }
                />
              </label>
              <label className="field">
                Corner name · {labels.es}
                <Input
                  value={c.nameEs}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      corners: f.corners.map((x, j) =>
                        j === i ? { ...x, nameEs: e.target.value } : x,
                      ),
                    }))
                  }
                />
              </label>
              <label className="field">
                {labels.stake} · {labels.en}
                <Textarea
                  rows={2}
                  value={c.stakeEn}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      corners: f.corners.map((x, j) =>
                        j === i ? { ...x, stakeEn: e.target.value } : x,
                      ),
                    }))
                  }
                />
              </label>
              <label className="field">
                {labels.stake} · {labels.es}
                <Textarea
                  rows={2}
                  value={c.stakeEs}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      corners: f.corners.map((x, j) =>
                        j === i ? { ...x, stakeEs: e.target.value } : x,
                      ),
                    }))
                  }
                />
              </label>
            </div>
          </div>
        </section>
      ))}

      <section className="card">
        <label className="check">
          <Checkbox
            checked={esReviewed}
            onCheckedChange={(v) => toggleReviewed(v === true)}
            disabled={pending}
            data-testid="es-reviewed"
          />
          <span>
            Spanish reviewed by a person
            {esReviewed && esReviewedAt ? (
              <span className="t-small muted">
                {" "}
                — {esReviewedBy ?? "team"},{" "}
                {new Date(esReviewedAt).toLocaleDateString()}
              </span>
            ) : null}
          </span>
        </label>
        <p className="t-small muted" style={{ marginTop: 8 }}>
          Publish stays blocked until a person confirms the Spanish. Saving any
          change clears the flag.
        </p>
      </section>
    </div>
  );
}
