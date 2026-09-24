"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseKml, parseKmlMulti } from "@/lib/kml";
import { splitSubdivision, type SubdivisionLot } from "@/lib/geo/subdivision";
import {
  areaAcres,
  defaultEntrance,
  normalizeRing,
  orderCornersFromEntrance,
} from "@/lib/geo/corners";
import {
  TEST_LOT_GEOMETRY_SOURCE,
  TEST_LOT_RADIUS_FT,
  testLotEntrance,
  testLotRing,
} from "@/lib/geo/test-lot";
import type { LatLng } from "@/lib/geo/types";
import type { Json } from "@/lib/supabase/database.types";

export type ActionResult = { ok: boolean; message?: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createProperty(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const nameEn = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const county = String(formData.get("county") ?? "").trim();
  // A test lot takes a generated square instead of a CAD-verified KML, and the
  // DB trigger keeps it from ever being published.
  const testLot = formData.get("test_lot") === "on";
  if (!nameEn) return { ok: false, message: "Name is required" };

  // Assemble flow: an attached KML seeds the geometry in the same step.
  // Parse before inserting anything so a bad file never leaves a bare row.
  // A multi-polygon (master tract) KML creates the master AND its lots.
  const kmlFile = formData.get("kml");
  let parsedKml: ReturnType<typeof parseKml> | null = null;
  let subdivisionLots: SubdivisionLot[] | null = null;
  let kmlName = "";
  if (kmlFile instanceof File && kmlFile.size > 0) {
    if (testLot) {
      return { ok: false, message: "A test lot takes a generated square, not a KML" };
    }
    if (kmlFile.size > 2 * 1024 * 1024) return { ok: false, message: "KML too large (max 2 MB)" };
    try {
      const xml = await kmlFile.text();
      const multi = parseKmlMulti(xml);
      kmlName = kmlFile.name;
      if (multi.polygons.length > 1) {
        subdivisionLots = splitSubdivision(multi.polygons);
      } else {
        parsedKml = parseKml(xml);
      }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Could not parse KML" };
    }
  }

  const supabase = await createClient();
  const slug = slugify(nameEn);
  if (!slug) return { ok: false, message: "Name must contain letters or numbers" };

  const { data, error } = await supabase
    .from("properties")
    .insert({
      slug,
      name: { en: nameEn, es: "" },
      address: address || null,
      county: county || null,
      test_lot: testLot,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "A property with that name already exists" : error.message,
    };
  }

  if (parsedKml) {
    const applied = await applyParsedKml(supabase, data.id, parsedKml, kmlName);
    if (!applied.ok) {
      // The property exists; geometry can be retried from the Corners tab.
      return { ok: false, message: `Property created, but KML import failed: ${applied.message}` };
    }
  }

  if (subdivisionLots) {
    const created = await createLotsUnderMaster(
      supabase,
      { id: data.id, slug, nameEn, address: address || null, county: county || null },
      subdivisionLots,
      kmlFile instanceof File ? kmlFile : null,
      kmlName,
    );
    if (!created.ok) {
      return { ok: false, message: `Master created, but lot split failed: ${created.message}` };
    }
  }
  redirect(`/admin/properties/${data.id}`);
}

/**
 * Master-tract KML on an existing property: split the file into lots as
 * children of the master. The master keeps no geometry of its own — it is
 * the folder; each lot walks through the assembly pipeline individually.
 */
export async function importSubdivisionKml(
  masterId: string,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("kml");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a .kml file" };
  if (file.size > 2 * 1024 * 1024) return { ok: false, message: "KML too large (max 2 MB)" };

  let lots: SubdivisionLot[];
  try {
    const multi = parseKmlMulti(await file.text());
    if (multi.polygons.length < 2) {
      return {
        ok: false,
        message: "This KML has a single boundary — import it on the Corners tab instead.",
      };
    }
    lots = splitSubdivision(multi.polygons);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not parse KML" };
  }

  const supabase = await createClient();
  const { data: master, error: masterError } = await supabase
    .from("properties")
    .select("id, slug, name, address, county, parent_id")
    .eq("id", masterId)
    .maybeSingle();
  if (masterError) return { ok: false, message: masterError.message };
  if (!master) return { ok: false, message: "Property not found" };
  if (master.parent_id) {
    return { ok: false, message: "This property is a lot — masters hold the subdivision KML." };
  }
  const { count: existing } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", masterId);
  if ((existing ?? 0) > 0) {
    return {
      ok: false,
      message: "This master already has lots. Delete them first to re-import the subdivision.",
    };
  }

  const nameEn =
    typeof master.name === "object" && master.name !== null
      ? String((master.name as Record<string, unknown>).en ?? master.slug)
      : master.slug;
  const result = await createLotsUnderMaster(
    supabase,
    { id: master.id, slug: master.slug, nameEn, address: master.address, county: master.county },
    lots,
    file,
    file.name,
  );
  if (result.ok) revalidatePath(`/admin/properties/${masterId}`);
  return result;
}

/** Create child lot properties (+ geometry) and file the master KML in Documents. */
async function createLotsUnderMaster(
  supabase: Awaited<ReturnType<typeof createClient>>,
  master: { id: string; slug: string; nameEn: string; address: string | null; county: string | null },
  lots: SubdivisionLot[],
  file: File | null,
  fileName: string,
): Promise<ActionResult> {
  for (const lot of lots) {
    const lotLabel = lot.name?.trim() || `Lot ${lot.n}`;
    const { data: child, error } = await supabase
      .from("properties")
      .insert({
        slug: `${master.slug}-lot-${lot.n}`,
        name: { en: `${master.nameEn} — ${lotLabel}`, es: "" },
        address: master.address,
        county: master.county,
        parent_id: master.id,
      })
      .select("id")
      .single();
    if (error) {
      return {
        ok: false,
        message:
          error.code === "23505"
            ? `Lot ${lot.n}: slug ${master.slug}-lot-${lot.n} already exists`
            : `Lot ${lot.n}: ${error.message}`,
      };
    }
    const applied = await applyParsedKml(
      supabase,
      child.id,
      { name: `lot ${lot.n}`, description: null, ring: lot.ring, point: null },
      fileName,
    );
    if (!applied.ok) return { ok: false, message: `Lot ${lot.n}: ${applied.message}` };
  }

  // Master totals + audit; the source file lands in the master's Documents.
  const totalAcres = Math.round(lots.reduce((s, l) => s + l.acres, 0) * 100) / 100;
  await supabase.from("properties").update({ acres: totalAcres }).eq("id", master.id);
  if (file) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error: upError } = await supabase.storage
      .from("property-photos")
      .upload(`${master.id}/documents/${safeName}`, await file.arrayBuffer(), {
        upsert: true,
        contentType: "application/vnd.google-earth.kml+xml",
      });
    if (!upError) {
      await supabase.rpc("write_audit", {
        p_action: "document_uploaded",
        p_property_id: master.id,
        p_detail: { path: `${master.id}/documents/${safeName}` },
      });
    }
  }
  await supabase.rpc("write_audit", {
    p_action: "subdivision_imported",
    p_property_id: master.id,
    p_detail: {
      file: fileName,
      lots: lots.length,
      acres: totalAcres,
      pruned: lots.reduce((s, l) => s + l.prunedVertices, 0),
    },
  });
  revalidatePath("/admin/properties");
  return { ok: true };
}

/** Apply parsed KML geometry to a property (shared by create + Corners tab). */
async function applyParsedKml(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propertyId: string,
  parsed: ReturnType<typeof parseKml>,
  fileName: string,
): Promise<ActionResult> {
  const ring = normalizeRing(parsed.ring);
  const entrance = defaultEntrance(ring);
  const ordered = orderCornersFromEntrance(ring, entrance);
  const acres = Math.round(areaAcres(ring) * 100) / 100;

  const boundary: Json = {
    type: "Polygon",
    coordinates: [
      [...ordered, ordered[0]!].map((p) => [p.lng, p.lat] as unknown as Json),
    ],
  } as unknown as Json;

  const { error: propError } = await supabase
    .from("properties")
    .update({
      boundary,
      acres,
      entrance_lat: entrance.lat,
      entrance_lng: entrance.lng,
      geometry_source: `${fileName} · ${parsed.name ?? "KML polygon"}`,
    })
    .eq("id", propertyId);
  if (propError) return { ok: false, message: propError.message };

  const { error: delError } = await supabase
    .from("corners")
    .delete()
    .eq("property_id", propertyId);
  if (delError) return { ok: false, message: delError.message };

  const { error: insError } = await supabase.from("corners").insert(
    ordered.map((p, i) => ({
      property_id: propertyId,
      n: i + 1,
      lat: p.lat,
      lng: p.lng,
    })),
  );
  if (insError) return { ok: false, message: insError.message };

  await supabase.rpc("write_audit", {
    p_action: "kml_imported",
    p_property_id: propertyId,
    p_detail: { file: fileName, corners: ordered.length },
  });
  return { ok: true };
}

/**
 * KML import (guardrail #2): boundary polygon + corners numbered clockwise
 * from the entrance. Replaces any existing unlocked geometry; refuses to touch
 * locked corners.
 */
export async function importKml(
  propertyId: string,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("kml");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a .kml file" };
  }
  if (file.size > 1024 * 1024) {
    return { ok: false, message: "KML too large (max 1 MB)" };
  }

  let parsed;
  try {
    parsed = parseKml(await file.text());
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not parse KML" };
  }

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("corners")
    .select("id, locked")
    .eq("property_id", propertyId);
  if (existingError) return { ok: false, message: existingError.message };
  if (existing.some((c) => c.locked)) {
    return {
      ok: false,
      message: "Corners are locked. Unlock (admin) before re-importing geometry.",
    };
  }

  const applied = await applyParsedKml(supabase, propertyId, parsed, file.name);
  if (!applied.ok) return applied;

  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Move the entrance to a clicked point; corner numbering re-derives. */
export async function moveEntrance(
  propertyId: string,
  entrance: LatLng,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: corners, error } = await supabase
    .from("corners")
    .select("id, n, lat, lng, name, stake, approach_photo, stake_photo, locked")
    .eq("property_id", propertyId)
    .order("n");
  if (error) return { ok: false, message: error.message };
  if (corners.length < 3) return { ok: false, message: "Import a KML first" };
  if (corners.some((c) => c.locked)) {
    return { ok: false, message: "Corners are locked. Unlock (admin) before renumbering." };
  }

  const ring = corners.map((c) => ({ lat: c.lat, lng: c.lng }));
  const ordered = orderCornersFromEntrance(ring, entrance);

  // Renumber: map each existing corner row to its new position so names,
  // stake text and photos travel with the physical corner.
  const byKey = new Map(corners.map((c) => [`${c.lat},${c.lng}`, c]));
  const { error: delError } = await supabase
    .from("corners")
    .delete()
    .eq("property_id", propertyId);
  if (delError) return { ok: false, message: delError.message };

  const { error: insError } = await supabase.from("corners").insert(
    ordered.map((p, i) => {
      const old = byKey.get(`${p.lat},${p.lng}`);
      return {
        property_id: propertyId,
        n: i + 1,
        lat: p.lat,
        lng: p.lng,
        name: old?.name ?? { en: "", es: "" },
        stake: old?.stake ?? { en: "", es: "" },
        approach_photo: old?.approach_photo ?? null,
        stake_photo: old?.stake_photo ?? null,
      };
    }),
  );
  if (insError) return { ok: false, message: insError.message };

  const { error: entError } = await supabase
    .from("properties")
    .update({ entrance_lat: entrance.lat, entrance_lng: entrance.lng })
    .eq("id", propertyId);
  if (entError) return { ok: false, message: entError.message };

  await supabase.rpc("write_audit", {
    p_action: "entrance_moved",
    p_property_id: propertyId,
    p_detail: { lat: entrance.lat, lng: entrance.lng },
  });

  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Lock all corners (CAD-verified). */
export async function lockCorners(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("corners")
    .update({ locked: true })
    .eq("property_id", propertyId)
    .eq("locked", false);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Unlock corners for adjustment — admin only; the DB trigger enforces and logs it. */
export async function unlockCorners(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("corners")
    .update({ locked: false })
    .eq("property_id", propertyId)
    .eq("locked", true);
  if (error) {
    return {
      ok: false,
      message: error.message.includes("admin_only")
        ? "Only an admin can unlock corners."
        : error.message,
    };
  }
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Drag-to-adjust a single (unlocked) corner. */
export async function moveCorner(
  cornerId: string,
  propertyId: string,
  lat: number,
  lng: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("corners")
    .update({ lat, lng })
    .eq("id", cornerId);
  if (error) {
    return {
      ok: false,
      message: error.message.includes("corner_locked")
        ? "That corner is locked. Unlock before moving it."
        : error.message,
    };
  }
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/**
 * Demo mode. Off means the buyer walk runs live device GPS and nothing else —
 * a `?demo=` on the link is ignored. On means the Demo tab's simulated-walk
 * scenarios run, which is how the pilot property has always behaved.
 */
export async function setDemoMode(
  propertyId: string,
  demoMode: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ demo_mode: demoMode })
    .eq("id", propertyId);
  if (error) return { ok: false, message: error.message };
  await supabase.rpc("write_audit", {
    p_action: "demo_mode_changed",
    p_property_id: propertyId,
    p_detail: { to: demoMode },
  });
  revalidatePath("/admin/properties");
  // "layout" so the nested Demo tab re-renders too — the scenario launchers
  // are server-rendered off this flag, and a page-scoped revalidate would
  // leave them stale until a manual reload.
  revalidatePath(`/admin/properties/${propertyId}`, "layout");
  return { ok: true };
}

/**
 * Drop a generated test square on a clicked point — the live-GPS field test
 * target. Refuses on anything but a property already marked `test_lot`, so
 * CAD-verified geometry can never be overwritten by a generated square, and
 * refuses while corners are locked, like every other geometry edit.
 */
export async function placeTestLot(
  propertyId: string,
  center: LatLng,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: property, error: propFindError } = await supabase
    .from("properties")
    .select("id, test_lot")
    .eq("id", propertyId)
    .maybeSingle();
  if (propFindError) return { ok: false, message: propFindError.message };
  if (!property) return { ok: false, message: "Property not found" };
  if (!property.test_lot) {
    return {
      ok: false,
      message:
        "Only a test lot can take a generated square. Real corners come from a CAD-verified KML.",
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("corners")
    .select("id, locked")
    .eq("property_id", propertyId);
  if (existingError) return { ok: false, message: existingError.message };
  if (existing.some((c) => c.locked)) {
    return {
      ok: false,
      message: "Corners are locked. Unlock (admin) before moving the test square.",
    };
  }

  const ring = testLotRing(center, TEST_LOT_RADIUS_FT);
  const entrance = testLotEntrance(ring);
  const acres = Math.round(areaAcres(ring) * 100) / 100;

  const boundary: Json = {
    type: "Polygon",
    coordinates: [
      [...ring, ring[0]!].map((p) => [p.lng, p.lat] as unknown as Json),
    ],
  } as unknown as Json;

  const { error: propError } = await supabase
    .from("properties")
    .update({
      boundary,
      acres,
      entrance_lat: entrance.lat,
      entrance_lng: entrance.lng,
      geometry_source: TEST_LOT_GEOMETRY_SOURCE,
    })
    .eq("id", propertyId);
  if (propError) return { ok: false, message: propError.message };

  const { error: delError } = await supabase
    .from("corners")
    .delete()
    .eq("property_id", propertyId);
  if (delError) return { ok: false, message: delError.message };

  const { error: insError } = await supabase.from("corners").insert(
    ring.map((p, i) => ({
      property_id: propertyId,
      n: i + 1,
      lat: p.lat,
      lng: p.lng,
    })),
  );
  if (insError) return { ok: false, message: insError.message };

  await supabase.rpc("write_audit", {
    p_action: "test_lot_placed",
    p_property_id: propertyId,
    p_detail: { lat: center.lat, lng: center.lng, radiusFt: TEST_LOT_RADIUS_FT },
  });

  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Notate the lot's sale state: available | under_contract | sold. */
export async function setSaleStatus(
  propertyId: string,
  saleStatus: "available" | "under_contract" | "sold",
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ sale_status: saleStatus })
    .eq("id", propertyId);
  if (error) return { ok: false, message: error.message };
  await supabase.rpc("write_audit", {
    p_action: "sale_status_changed",
    p_property_id: propertyId,
    p_detail: { to: saleStatus },
  });
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/**
 * Delete a property outright (admin only — RLS enforces it; for editors the
 * delete matches zero rows). Cascades take the corners, media rows, links and
 * demo scenarios; uploaded photos are removed from Storage via service role.
 */
export async function deleteProperty(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: property, error: findError } = await supabase
    .from("properties")
    .select("id, slug")
    .eq("id", propertyId)
    .maybeSingle();
  if (findError) return { ok: false, message: findError.message };
  if (!property) return { ok: false, message: "Property not found" };

  const { count, error } = await supabase
    .from("properties")
    .delete({ count: "exact" })
    .eq("id", propertyId);
  if (error) return { ok: false, message: error.message };
  if (!count) {
    return { ok: false, message: "Only an admin can delete a property" };
  }

  // Best-effort storage cleanup; rows are already gone.
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const paths: string[] = [];
    for (const folder of [`${propertyId}/corners`, `${propertyId}/property`]) {
      const { data: files } = await admin.storage.from("property-photos").list(folder);
      for (const f of files ?? []) paths.push(`${folder}/${f.name}`);
    }
    if (paths.length > 0) {
      await admin.storage.from("property-photos").remove(paths);
    }
  } catch {
    // photos become orphans at worst; nothing user-facing breaks
  }

  await supabase.rpc("write_audit", {
    p_action: "property_deleted",
    p_property_id: propertyId,
    p_detail: { slug: property.slug },
  });

  revalidatePath("/admin/properties");
  redirect("/admin/properties");
}
