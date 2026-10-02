// Capture-protocol slots (Photos tab checklist). Message keys live under
// admin.photos in messages/en.json.
export const PHOTO_SLOTS_PER_CORNER = ["approach", "stake"] as const;
export const PROPERTY_PHOTO_SLOTS = [
  "entrance360",
  "homesite",
  "gate",
  "aerial",
] as const;

/**
 * Shared example-pin image in the property-photos bucket (seeded by the
 * seed-default-photo workflow). It may sit in corners.stake_photo as a
 * stand-in, but it is never a real field photo: admin checklists, the
 * media pipeline and the walk's caption all treat it as "no photo yet".
 */
export const DEFAULT_STAKE_PHOTO_PATH = "defaults/corner-pin-default.jpg";
/** Same stand-in idea for the 30-ft approach slot. */
export const DEFAULT_APPROACH_PHOTO_PATH = "defaults/corner-approach-default.jpg";

export type CornerPhotoSlot = (typeof PHOTO_SLOTS_PER_CORNER)[number];
export type PropertyPhotoSlot = (typeof PROPERTY_PHOTO_SLOTS)[number];

export function cornerPhotoPath(
  propertyId: string,
  n: number,
  slot: CornerPhotoSlot,
  ext: string,
) {
  return `${propertyId}/corners/c${n}-${slot}.${ext}`;
}

export function propertyPhotoPath(
  propertyId: string,
  slot: PropertyPhotoSlot,
  ext: string,
) {
  return `${propertyId}/property/${slot}.${ext}`;
}
