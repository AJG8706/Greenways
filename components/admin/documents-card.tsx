"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Upload } from "lucide-react";
import { recordDocumentEvent } from "@/app/admin/(console)/properties/[id]/documents-actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export type PropertyDocument = {
  name: string;
  path: string;
  signedUrl: string | null;
  sizeKb: number | null;
};

const ALLOWED = /\.(kml|pdf)$/i;

/**
 * Property documents (surveys, plats, source KML): KML/PDF only, stored in
 * the private bucket under {propertyId}/documents/. Team-internal — nothing
 * here is served to buyers.
 */
export function DocumentsCard({
  propertyId,
  documents,
  labels,
}: {
  propertyId: string;
  documents: PropertyDocument[];
  labels: {
    title: string;
    hint: string;
    upload: string;
    uploading: string;
    remove: string;
    removeConfirm: string;
    empty: string;
    badType: string;
  };
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function upload(file: File) {
    setError(null);
    if (!ALLOWED.test(file.name)) {
      setError(labels.badType);
      return;
    }
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
      const path = `${propertyId}/documents/${safeName}`;
      const supabase = createClient();
      const { error: upError } = await supabase.storage
        .from("property-photos")
        .upload(path, file, {
          upsert: true,
          contentType: file.type || (safeName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/vnd.google-earth.kml+xml"),
        });
      if (upError) throw new Error(upError.message);
      startTransition(async () => {
        await recordDocumentEvent(propertyId, "document_uploaded", path);
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(path: string) {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: rmError } = await supabase.storage.from("property-photos").remove([path]);
      if (rmError) throw new Error(rmError.message);
      startTransition(async () => {
        await recordDocumentEvent(propertyId, "document_removed", path);
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
      setConfirmPath(null);
    }
  }

  return (
    <section className="card stack" style={{ gap: "var(--gw-s-3)" }} data-testid="documents-card">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3>{labels.title}</h3>
          <p className="t-small muted">{labels.hint}</p>
        </div>
        <span>
          <input
            ref={fileRef}
            type="file"
            accept=".kml,.pdf,application/pdf,application/vnd.google-earth.kml+xml"
            className="sr-only"
            data-testid="document-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            data-testid="document-upload"
          >
            <Upload aria-hidden size={14} /> {busy ? labels.uploading : labels.upload}
          </Button>
        </span>
      </div>

      {documents.length === 0 ? (
        <p className="t-small muted" data-testid="documents-empty">
          {labels.empty}
        </p>
      ) : (
        <ul className="stack" style={{ gap: 6 }} data-testid="documents-list">
          {documents.map((d) => (
            <li key={d.path} className="row between" style={{ gap: 8 }}>
              <span className="row" style={{ gap: 6, minWidth: 0 }}>
                <FileText size={16} aria-hidden />
                {d.signedUrl ? (
                  <a
                    href={d.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="t-small"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {d.name}
                  </a>
                ) : (
                  <span className="t-small">{d.name}</span>
                )}
                {d.sizeKb !== null ? (
                  <span className="t-small muted num">{d.sizeKb} KB</span>
                ) : null}
              </span>
              <Button
                size="sm"
                variant={confirmPath === d.path ? "danger" : "ghost"}
                disabled={busy}
                onClick={() => {
                  if (confirmPath === d.path) void remove(d.path);
                  else setConfirmPath(d.path);
                }}
                data-testid={`document-remove-${d.name}`}
              >
                <Trash2 aria-hidden size={14} />
                {confirmPath === d.path ? labels.removeConfirm : labels.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className="t-small" style={{ color: "var(--error)" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
