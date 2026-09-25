"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import {
  recordCornerPhoto,
  recordPropertyPhoto,
} from "@/app/admin/(console)/properties/[id]/photos/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  cornerPhotoPath,
  propertyPhotoPath,
  PROPERTY_PHOTO_SLOTS,
  type PropertyPhotoSlot,
} from "@/lib/photos";

export type IntakeLot = {
  id: string;
  /** 1-based plat order — what field crews call "lot N". */
  n: number;
  label: string;
  corners: { id: string; n: number }[];
};

type Row = {
  file: File;
  lotIdx: number;
  /** "aerial" | ... | "c{n}-approach" | "c{n}-stake" | "" (unassigned) */
  target: string;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
};

/**
 * Master-level photo intake: drop a whole field session's photos at once,
 * confirm (or fix) the guessed lot + slot per file, upload in one go. Each
 * file lands through the exact same storage path + record action as the
 * per-lot Photos tab — this only removes the per-lot upload sessions.
 * Filename conventions it recognizes: "lot3", "lot 3", "l3"; "aerial",
 * "gate", "homesite", "entrance"/"360"; "c2"/"corner 2" + "approach"/"stake".
 */
export function BulkPhotoIntake({ lots }: { lots: IntakeLot[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  function guess(fileName: string): { lotIdx: number; target: string } {
    const name = fileName.toLowerCase();
    const lotMatch = /(?:^|[^a-z])l(?:ot)?[\s_-]*(\d+)/.exec(name);
    const lotN = lotMatch ? Number(lotMatch[1]) : NaN;
    const lotIdx = lots.findIndex((l) => l.n === lotN);

    let target = "";
    if (/aerial/.test(name)) target = "aerial";
    else if (/gate/.test(name)) target = "gate";
    else if (/homesite|home[\s_-]?site/.test(name)) target = "homesite";
    else if (/entrance|360/.test(name)) target = "entrance360";
    else {
      const cornerMatch = /c(?:orner)?[\s_-]*(\d+)/.exec(name.replace(lotMatch?.[0] ?? "", ""));
      if (cornerMatch) {
        const kind = /stake/.test(name) ? "stake" : "approach";
        target = `c${cornerMatch[1]}-${kind}`;
      }
    }
    return { lotIdx: lotIdx >= 0 ? lotIdx : 0, target };
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setRows((prev) => [
      ...prev,
      ...Array.from(files).map((file) => ({
        file,
        ...guess(file.name),
        status: "pending" as const,
      })),
    ]);
  }

  function setRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function uploadAll() {
    setRunning(true);
    const supabase = createClient();
    let failed = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (row.status === "done") continue;
      const lot = lots[row.lotIdx];
      if (!lot || !row.target) {
        setRow(i, { status: "error", message: "Pick a lot and a slot" });
        failed++;
        continue;
      }
      setRow(i, { status: "uploading", message: undefined });
      try {
        const ext = (row.file.name.split(".").pop() ?? "jpg").toLowerCase();
        const cornerTarget = /^c(\d+)-(approach|stake)$/.exec(row.target);
        let result: { ok: boolean; message?: string };
        if (cornerTarget) {
          const n = Number(cornerTarget[1]);
          const slot = cornerTarget[2] as "approach" | "stake";
          const corner = lot.corners.find((c) => c.n === n);
          if (!corner) throw new Error(`${lot.label} has no corner ${n}`);
          const path = cornerPhotoPath(lot.id, n, slot, ext);
          const { error } = await supabase.storage
            .from("property-photos")
            .upload(path, row.file, { upsert: true, contentType: row.file.type || undefined });
          if (error) throw new Error(error.message);
          result = await recordCornerPhoto(lot.id, corner.id, slot, path);
        } else {
          const path = propertyPhotoPath(lot.id, row.target as PropertyPhotoSlot, ext);
          const { error } = await supabase.storage
            .from("property-photos")
            .upload(path, row.file, { upsert: true, contentType: row.file.type || undefined });
          if (error) throw new Error(error.message);
          result = await recordPropertyPhoto(lot.id, row.target, path);
        }
        if (!result.ok) throw new Error(result.message ?? "Record failed");
        setRow(i, { status: "done" });
      } catch (e) {
        setRow(i, { status: "error", message: e instanceof Error ? e.message : "Upload failed" });
        failed++;
      }
    }
    setRunning(false);
    if (failed === 0 && rows.length > 0) window.location.reload();
  }

  const pendingCount = rows.filter((r) => r.status !== "done").length;

  return (
    <div className="stack" style={{ gap: "var(--gw-s-4)" }} data-testid="bulk-photo-intake">
      <div className="row" style={{ gap: "var(--gw-s-3)", flexWrap: "wrap" }}>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          data-testid="bulk-photo-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={running}>
          <Upload size={16} /> Add photos
        </Button>
        {rows.length > 0 ? (
          <Button onClick={uploadAll} disabled={running || pendingCount === 0} data-testid="bulk-photo-upload">
            {running ? "Uploading..." : `Upload ${pendingCount} photos`}
          </Button>
        ) : null}
      </div>
      <p className="t-small muted">
        Name files like <code>lot3-aerial.jpg</code> or <code>lot7-c2-stake.jpg</code> and the
        lot and slot fill themselves — anything else, assign below. Uploads land on each lot
        exactly as if done from its own Photos tab.
      </p>

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table data-testid="bulk-photo-rows">
            <thead>
              <tr>
                <th>File</th>
                <th>Lot</th>
                <th>Slot</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const lot = lots[row.lotIdx];
                return (
                  <tr key={`${row.file.name}-${i}`}>
                    <td className="t-small" style={{ overflowWrap: "anywhere" }}>
                      {row.file.name}
                    </td>
                    <td>
                      <Select
                        value={String(row.lotIdx)}
                        disabled={running || row.status === "done"}
                        onChange={(e) => setRow(i, { lotIdx: Number(e.target.value) })}
                        style={{ minHeight: 32, padding: "2px 8px" }}
                      >
                        {lots.map((l, idx) => (
                          <option key={l.id} value={idx}>
                            {l.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <Select
                        value={row.target}
                        disabled={running || row.status === "done"}
                        onChange={(e) => setRow(i, { target: e.target.value })}
                        style={{ minHeight: 32, padding: "2px 8px" }}
                      >
                        <option value="">Choose…</option>
                        {PROPERTY_PHOTO_SLOTS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                        {(lot?.corners ?? []).flatMap((c) => [
                          <option key={`c${c.n}-approach`} value={`c${c.n}-approach`}>
                            C{c.n} approach
                          </option>,
                          <option key={`c${c.n}-stake`} value={`c${c.n}-stake`}>
                            C{c.n} stake
                          </option>,
                        ])}
                      </Select>
                    </td>
                    <td>
                      {row.status === "done" ? (
                        <span className="pill pill-live">Uploaded</span>
                      ) : row.status === "uploading" ? (
                        <span className="pill pill-working">Uploading…</span>
                      ) : row.status === "error" ? (
                        <span className="t-small" style={{ color: "var(--error)" }}>
                          {row.message}
                        </span>
                      ) : (
                        <span className="pill pill-draft">Ready</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
