"use client";

import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import {
  recordCornerPhoto,
  recordPropertyPhoto,
} from "@/app/admin/(console)/properties/[id]/photos/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cornerPhotoPath, propertyPhotoPath } from "@/lib/photos";

export type PhotoItem =
  | {
      key: string;
      label: string;
      kind: "corner";
      cornerId: string;
      cornerN: number;
      slot: "approach" | "stake";
      path: string | null;
    }
  | {
      key: string;
      label: string;
      kind: "property";
      slot: string;
      path: string | null;
    };

export function PhotoChecklist({
  propertyId,
  items,
  labels,
}: {
  propertyId: string;
  items: PhotoItem[];
  labels: { upload: string; missing: string; ready: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function upload(item: PhotoItem, file: File) {
    setError(null);
    setBusyKey(item.key);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path =
        item.kind === "corner"
          ? cornerPhotoPath(propertyId, item.cornerN, item.slot, ext)
          : propertyPhotoPath(propertyId, item.slot as never, ext);

      const supabase = createClient();
      const { error: upError } = await supabase.storage
        .from("property-photos")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upError) throw new Error(upError.message);

      startTransition(async () => {
        const result =
          item.kind === "corner"
            ? await recordCornerPhoto(propertyId, item.cornerId, item.slot, path)
            : await recordPropertyPhoto(propertyId, item.slot, path);
        if (!result.ok) setError(result.message ?? "Could not record photo");
        setBusyKey(null);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusyKey(null);
    }
  }

  return (
    <div className="stack" style={{ gap: "var(--gw-s-4)" }}>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="table-wrap">
        <table data-testid="photo-checklist">
          <tbody>
            {items.map((item) => (
              <tr key={item.key}>
                <td className="t-body-m">{item.label}</td>
                <td>
                  <span className={`pill ${item.path ? "pill-live" : "pill-draft"}`}>
                    {item.path ? labels.ready : labels.missing}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(item, f);
                        e.target.value = "";
                      }}
                    />
                    <Button asChild variant="secondary" size="sm" disabled={busyKey !== null}>
                      <span style={{ cursor: "pointer" }}>
                        <Upload size={14} />{" "}
                        {busyKey === item.key ? "…" : labels.upload}
                      </span>
                    </Button>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
