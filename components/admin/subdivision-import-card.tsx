"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderTree, Upload } from "lucide-react";
import { importSubdivisionKml } from "@/app/admin/(console)/properties/actions";
import { Button } from "@/components/ui/button";

/**
 * Master-tract KML upload: splits a multi-polygon subdivision KML into lot
 * properties under this master. Shown only while the property has no lots.
 */
export function SubdivisionImportCard({
  propertyId,
  labels,
}: {
  propertyId: string;
  labels: {
    title: string;
    hint: string;
    upload: string;
    uploading: string;
    badType: string;
  };
}) {
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function importFile(file: File) {
    setError(null);
    if (!/\.kml$/i.test(file.name)) {
      setError(labels.badType);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("kml", file);
      const res = await importSubdivisionKml(propertyId, fd);
      if (!res.ok) setError(res.message ?? "Import failed");
      else router.refresh();
    });
  }

  return (
    <section className="card stack" style={{ gap: "var(--gw-s-3)" }} data-testid="subdivision-card">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 className="row" style={{ gap: 6 }}>
            <FolderTree size={16} aria-hidden /> {labels.title}
          </h3>
          <p className="t-small muted">{labels.hint}</p>
        </div>
        <span>
          <input
            ref={fileRef}
            type="file"
            accept=".kml,application/vnd.google-earth.kml+xml"
            className="sr-only"
            data-testid="subdivision-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
            data-testid="subdivision-upload"
          >
            <Upload aria-hidden size={14} /> {pending ? labels.uploading : labels.upload}
          </Button>
        </span>
      </div>
      {error ? (
        <p className="t-small" style={{ color: "var(--error)" }} data-testid="subdivision-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
