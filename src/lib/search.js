import { getEntryTitle } from './entryTitle.js';
import { stripMarkdown } from './richText.js';
import { getEntryImages } from './entryImages.js';

// Search with a few operators, for when plain words aren't enough:
//   rain walk            entries containing both words (anywhere, any case)
//   "rainy evening"      the exact phrase
//   -work                leave out entries containing "work"
//   mood:sad             mood (also weather:, tag:)
//   before:2025-06  after:2025      by date (year, year-month, or full date)
//   has:photo  has:voice  has:weather  has:location
// Several values for one operator mean "any of these"; everything else
// must all match.

const OPERATORS = ['mood', 'weather', 'tag', 'before', 'after', 'has'];

function tokenize(query) {
  const tokens = [];
  const pattern = /(-?)(?:(\w+):)?(?:"([^"]*)"|(\S+))/g;
  let m;
  while ((m = pattern.exec(query))) {
    tokens.push({ negate: m[1] === '-', key: m[2]?.toLowerCase(), value: (m[3] ?? m[4] ?? '').toLowerCase(), quoted: m[3] !== undefined });
  }
  return tokens;
}

export function parseQuery(query) {
  const parsed = { words: [], phrases: [], excluded: [], mood: [], weather: [], tag: [], has: [], before: null, after: null };

  for (const token of tokenize(query || '')) {
    if (!token.value) continue;
    if (token.key && OPERATORS.includes(token.key)) {
      if (token.key === 'before' || token.key === 'after') parsed[token.key] = token.value;
      else parsed[token.key].push(token.value);
    } else {
      const text = token.key ? `${token.key}:${token.value}` : token.value;
      if (token.negate) parsed.excluded.push(text);
      else if (token.quoted) parsed.phrases.push(text);
      else parsed.words.push(text);
    }
  }
  return parsed;
}

export function isEmptyQuery(parsed) {
  return (
    !parsed.words.length &&
    !parsed.phrases.length &&
    !parsed.excluded.length &&
    !parsed.mood.length &&
    !parsed.weather.length &&
    !parsed.tag.length &&
    !parsed.has.length &&
    !parsed.before &&
    !parsed.after
  );
}

// "2025" -> start of 2025; "2025-06" -> 1 June 2025; "2025-06-14" -> that day.
function dateBound(value, end) {
  const [y, m, d] = value.split('-').map(Number);
  if (!y) return null;
  if (!m) return end ? new Date(y + 1, 0, 1) : new Date(y, 0, 1);
  if (!d) return end ? new Date(y, m, 1) : new Date(y, m - 1, 1);
  return end ? new Date(y, m - 1, d + 1) : new Date(y, m - 1, d);
}

// Searching re-reads every entry on each keystroke, so the lowercased text
// is cached per entry object. Entries are never mutated (a change makes a
// new object), so a cached value can't go stale.
const textCache = new WeakMap();

export function searchableText(entry) {
  const cached = textCache.get(entry);
  if (cached !== undefined) return cached;
  const text = buildSearchableText(entry);
  textCache.set(entry, text);
  return text;
}

function buildSearchableText(entry) {
  return [getEntryTitle(entry), stripMarkdown(entry.content), entry.mood, entry.weatherType, entry.locationName, ...(entry.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const HAS = {
  photo: (e) => getEntryImages(e).length > 0,
  photos: (e) => getEntryImages(e).length > 0,
  voice: (e) => (e.audio || []).length > 0,
  audio: (e) => (e.audio || []).length > 0,
  weather: (e) => Boolean(e.weatherType),
  location: (e) => Boolean(e.locationName || typeof e.latitude === 'number'),
  habits: (e) => Boolean(e.habits && Object.keys(e.habits).length),
};

export function matchesQuery(entry, parsed) {
  const text = searchableText(entry);
  if (!parsed.words.every((w) => text.includes(w))) return false;
  if (!parsed.phrases.every((p) => text.includes(p))) return false;
  if (parsed.excluded.some((w) => text.includes(w))) return false;
  if (parsed.mood.length && !parsed.mood.includes((entry.mood || '').toLowerCase())) return false;
  if (parsed.weather.length && !parsed.weather.some((w) => (entry.weatherType || '').toLowerCase().includes(w))) return false;
  if (parsed.tag.length) {
    const tags = (entry.tags || []).map((t) => t.trim().toLowerCase());
    if (!parsed.tag.some((t) => tags.includes(t))) return false;
  }
  if (parsed.has.length && !parsed.has.every((h) => HAS[h]?.(entry))) return false;
  if (parsed.before || parsed.after) {
    const d = new Date(entry.date);
    if (isNaN(d)) return false;
    const before = parsed.before && dateBound(parsed.before, false);
    const after = parsed.after && dateBound(parsed.after, true);
    if (before && !(d < before)) return false;
    if (after && !(d >= after)) return false;
  }
  return true;
}

// The words and phrases to highlight in results.
export function highlightTerms(parsed) {
  return [...parsed.phrases, ...parsed.words].filter((t) => t.length > 1);
}

// Splits text into [{ text, match }] around case-insensitive term matches.
export function splitHighlights(text, terms) {
  if (!terms?.length || !text) return [{ text: text || '', match: false }];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text
    .split(pattern)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, match: terms.some((t) => t.toLowerCase() === part.toLowerCase()) }));
}

// --- Related entries --------------------------------------------------------

const STOP_WORDS = new Set(
  'the a an and or but to of in on at for with was were is it i my me we our you your this that today day so just really very had have has be been am are not no'.split(
    ' ',
  ),
);

function keywords(entry) {
  return new Set(
    stripMarkdown(entry.content || '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}']+/u)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  );
}

// Up to `limit` other entries most like this one: shared tags count most,
// then shared words, then the same mood, weather, or place.
export function relatedEntries(entry, entries, limit = 3) {
  const words = keywords(entry);
  const tags = new Set((entry.tags || []).map((t) => t.trim().toLowerCase()));

  return entries
    .filter((other) => other.id !== entry.id)
    .map((other) => {
      let score = 0;
      for (const t of other.tags || []) if (tags.has(t.trim().toLowerCase())) score += 3;
      for (const w of keywords(other)) if (words.has(w)) score += 1;
      if (entry.mood && other.mood === entry.mood) score += 1;
      if (entry.weatherType && other.weatherType === entry.weatherType) score += 1;
      if (entry.locationName && other.locationName === entry.locationName) score += 1;
      return { entry: other, score };
    })
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score || new Date(b.entry.date) - new Date(a.entry.date))
    .slice(0, limit)
    .map((r) => r.entry);
}
