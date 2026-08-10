// Shared per-entry "Customize Appearance" mappings, used by both the
// timeline row and the full reading page so the two stay visually consistent.
export const FONT_FAMILY = {
  serif: 'var(--font-serif)',
  handwritten: 'var(--font-handwritten)',
  monospace: 'var(--font-mono)',
};

export function fontFamilyFor(entry) {
  return FONT_FAMILY[entry?.font] || 'var(--font-reading)';
}
