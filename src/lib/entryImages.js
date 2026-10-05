export const MAX_PHOTOS = 4;

// Entries saved before multi-photo support have a single `image` string;
// newer ones have an `images` array. Every reader goes through this so old
// entries and old export files keep working without a migration step. An
// old entry moves to `images` the next time it's saved from the form.
export function getEntryImages(entry) {
  if (Array.isArray(entry?.images)) return entry.images.filter(Boolean);
  return entry?.image ? [entry.image] : [];
}
