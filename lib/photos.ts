// Capture-protocol slots (Photos tab checklist). Message keys live under
// admin.photos in messages/en.json.
export const PHOTO_SLOTS_PER_CORNER = ["approach", "stake"] as const;
export const PROPERTY_PHOTO_SLOTS = [
  "entrance360",
  "homesite",
  "gate",
  "aerial",
] as const;

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
