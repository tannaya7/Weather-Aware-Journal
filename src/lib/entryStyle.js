// Shared per-entry appearance mappings, used by both the timeline row and
// the full reading page so the two stay visually consistent.
export const FONT_FAMILY = {
  serif: 'var(--font-serif)',
  handwritten: 'var(--font-handwritten)',
  monospace: 'var(--font-mono)',
};

export function fontFamilyFor(entry) {
  return FONT_FAMILY[entry?.font] || 'var(--font-reading)';
}

// Card color is derived from the fetched weather, not a user choice — a
// fixed pastel per Open-Meteo weather condition (see lib/weatherApi.js for
// the code -> weatherType mapping this keys off of). Text on every one of
// these stays dark ink, same as the app's previous peach/light-blue cards.
export const WEATHER_COLORS = {
  'Clear sky': { bg: '#fdf1cf', text: '#3d3212' },
  Clouds: { bg: '#e4e7ee', text: '#2c3038' },
  Fog: { bg: '#e7e5e1', text: '#33312d' },
  Drizzle: { bg: '#dbeeef', text: '#1f3a3b' },
  Rain: { bg: '#ccdaf0', text: '#1c2c47' },
  Snow: { bg: '#eef6fb', text: '#243645' },
  Thunderstorm: { bg: '#e2dcf0', text: '#2f2645' },
};

export function weatherCardStyle(entry) {
  const match = entry?.weatherType && WEATHER_COLORS[entry.weatherType];
  if (!match) return undefined;
  return { backgroundColor: match.bg, color: match.text };
}
