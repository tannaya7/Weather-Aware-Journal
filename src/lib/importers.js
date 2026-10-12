import { MOODS } from './moods.js';
import { iconForType } from './weatherApi.js';

// Bringing entries in from elsewhere, and out as Markdown:
//   - this app's own JSON export (an array of entries)
//   - Day One's JSON export, alone or inside its .zip
//   - Markdown: one entry per file (in a .zip, or picked one at a time),
//     or many in one file, each starting with a front-matter block:
//         ---
//         date: 2026-10-01T09:30
//         mood: Happy
//         tags: [walk, rain]
//         ---
//         The entry text…
// Every importer returns plain entries; merging (and skipping ones already
// here) is done by mergeEntries, the same as for backups. Imported entries
// get ids derived from their source, so importing twice adds nothing new.

const MOOD_NAMES = new Map(MOODS.map((m) => [m.value.toLowerCase(), m.value]));

export class ImportError extends Error {}

// --- Small helpers ------------------------------------------------------------

function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// The app keeps dates as local "YYYY-MM-DDTHH:MM" text.
function toLocalDateTime(value) {
  const d = new Date(value);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function cleanMood(value) {
  return MOOD_NAMES.get(String(value || '').trim().toLowerCase());
}

function cleanTags(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const tags = list.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean);
  return tags.length ? [...new Set(tags)] : undefined;
}

function withoutEmpty(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

// --- Day One ------------------------------------------------------------------

const DAY_ONE_WEATHER = [
  [/thunder|storm/i, 'Thunderstorm'],
  [/snow|sleet|flurr/i, 'Snow'],
  [/drizzle/i, 'Drizzle'],
  [/rain|shower/i, 'Rain'],
  [/fog|mist|haze/i, 'Fog'],
  [/cloud|overcast/i, 'Clouds'],
  [/clear|sunny|fair/i, 'Clear sky'],
];

function weatherTypeFrom(description) {
  return DAY_ONE_WEATHER.find(([pattern]) => pattern.test(description || ''))?.[1];
}

// Day One writes escaped Markdown ("\." and "\-"), and photos as
// "![](dayone-moment://...)" links that mean nothing here.
function cleanDayOneText(text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\(dayone-moment:[^)]*\)\s*/g, '')
    .replace(/\\([.\-!#*_()[\]`>+])/g, '$1')
    .trim();
}

export function isDayOneExport(data) {
  return Boolean(data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.entries) && data.metadata?.version !== undefined)
    || Boolean(data && Array.isArray(data.entries) && data.entries.some((e) => e?.creationDate && 'text' in e));
}

export function fromDayOne(data) {
  if (!isDayOneExport(data)) throw new ImportError('This is not a Day One export.');
  return data.entries
    .filter((e) => e && typeof e.text === 'string' && e.text.trim())
    .map((e) => {
      const weatherType = weatherTypeFrom(e.weather?.conditionsDescription);
      const temp = e.weather?.temperatureCelsius;
      return withoutEmpty({
        id: `dayone-${e.uuid || hashText(`${e.creationDate}${e.text}`)}`,
        content: cleanDayOneText(e.text),
        date: toLocalDateTime(e.creationDate) || toLocalDateTime(Date.now()),
        tags: cleanTags(e.tags),
        locationName: e.location?.localityName || e.location?.placeName,
        latitude: typeof e.location?.latitude === 'number' ? e.location.latitude : undefined,
        longitude: typeof e.location?.longitude === 'number' ? e.location.longitude : undefined,
        weatherType,
        weatherIcon: weatherType ? iconForType(weatherType) : undefined,
        temperature: typeof temp === 'number' ? `${Math.round(temp)}°C` : undefined,
      });
    });
}

// --- Markdown -----------------------------------------------------------------

function parseFrontMatterValue(raw) {
  const value = raw.trim();
  if (/^\[.*\]$/.test(value)) {
    // Items may be "quoted, with commas" or plain.
    const items = value.slice(1, -1).match(/\s*"(?:[^"\\]|\\.)*"|\s*'[^']*'|[^,]+/g) || [];
    return items
      .map((v) => v.trim())
      .map((v) => (v.startsWith('"') ? JSON.parse(v) : v.replace(/^'|'$/g, '')))
      .filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, '');
}

function parseFrontMatter(block) {
  const meta = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (m) meta[m[1].toLowerCase()] = parseFrontMatterValue(m[2]);
  }
  return meta;
}

// "2026-10-01 Rainy walk.md" -> a date to fall back on.
function dateFromFileName(name) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(name || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T12:00` : null;
}

function markdownEntry(meta, body, fileName, fileDate) {
  const content = body.trim();
  if (!content) return null;
  const date = toLocalDateTime(meta.date) || dateFromFileName(fileName) || (fileDate ? toLocalDateTime(fileDate) : null);
  return withoutEmpty({
    id: meta.id ? String(meta.id) : `md-${hashText(`${date}|${content}`)}`,
    content,
    date: date || toLocalDateTime(Date.now()),
    mood: cleanMood(meta.mood),
    tags: cleanTags(meta.tags),
    locationName: typeof meta.location === 'string' ? meta.location : undefined,
    weatherType: typeof meta.weather === 'string' ? meta.weather : undefined,
    weatherIcon: typeof meta.weather === 'string' ? iconForType(meta.weather) : undefined,
    temperature: typeof meta.temperature === 'string' ? meta.temperature : undefined,
  });
}

// One Markdown text: either a single entry (front matter optional) or
// several, each starting with its own front-matter block.
export function fromMarkdown(text, { fileName = '', fileDate = null } = {}) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const blocks = [...source.matchAll(/(?:^|\n)---\r?\n([\s\S]*?)\r?\n---\r?\n/g)];
  if (blocks.length === 0) {
    const entry = markdownEntry({}, source, fileName, fileDate);
    return entry ? [entry] : [];
  }
  const entries = [];
  blocks.forEach((block, i) => {
    const start = block.index + block[0].length;
    const end = i + 1 < blocks.length ? blocks[i + 1].index : source.length;
    const entry = markdownEntry(parseFrontMatter(block[1]), source.slice(start, end), fileName, fileDate);
    if (entry) entries.push(entry);
  });
  return entries;
}

function yamlList(list) {
  return `[${list.map((t) => (/[,\]"]/.test(t) ? JSON.stringify(t) : t)).join(', ')}]`;
}

// All entries as one Markdown file, oldest first, in the same shape
// fromMarkdown reads, so it can be imported again (here or elsewhere).
export function toMarkdown(entries) {
  return [...entries]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((e) => {
      const meta = [`id: ${e.id}`, `date: ${e.date}`];
      if (e.mood) meta.push(`mood: ${e.mood}`);
      if (e.tags?.length) meta.push(`tags: ${yamlList(e.tags)}`);
      if (e.weatherType) meta.push(`weather: ${e.weatherType}`);
      if (e.temperature) meta.push(`temperature: ${e.temperature}`);
      if (e.locationName) meta.push(`location: ${e.locationName}`);
      return `---\n${meta.join('\n')}\n---\n${(e.content || '').trim()}\n`;
    })
    .join('\n');
}

// --- Zip files ------------------------------------------------------------------
// Just enough of the zip format to read an export: the central directory,
// and "stored" or "deflated" files (DecompressionStream does the inflating).

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new ImportError('This browser cannot open .zip files. Unzip it first and import the files inside.');
  }
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: signature 0x06054b50, within the last 64 KB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportError('That .zip file could not be read.');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new ImportError('That .zip file could not be read.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue; // a folder
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);
    files.push({
      name,
      read: async () => {
        if (method === 0) return raw;
        if (method === 8) return inflateRaw(raw);
        throw new ImportError(`"${name}" in the .zip uses a compression this app cannot open.`);
      },
    });
  }
  return files;
}

// --- Any file -------------------------------------------------------------------

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportError('That file is not valid JSON.');
  }
}

function fromJsonText(text) {
  const data = parseJson(text);
  if (data?.format === 'weather-journal-backup') {
    throw new ImportError('This is an encrypted backup. Restore it from Export & share → Backups.');
  }
  if (Array.isArray(data)) return { format: 'Weather Journal', entries: data };
  if (isDayOneExport(data)) return { format: 'Day One', entries: fromDayOne(data) };
  throw new ImportError('This JSON file is not a journal this app knows how to read.');
}

const isMarkdownName = (name) => /\.(md|markdown|txt)$/i.test(name);

// Reads one picked file (or .zip) into { format, entries }. `file` needs
// name, text() and arrayBuffer(), like a browser File.
export async function parseImportFile(file) {
  const name = file.name || '';
  if (/\.zip$/i.test(name)) {
    const files = await readZip(await file.arrayBuffer());
    const decoder = new TextDecoder();
    const json = files.filter((f) => /\.json$/i.test(f.name) && !f.name.includes('__MACOSX'));
    const markdown = files.filter((f) => isMarkdownName(f.name) && !f.name.includes('__MACOSX'));
    if (json.length) {
      const entries = [];
      let format = 'Weather Journal';
      for (const f of json) {
        const result = fromJsonText(decoder.decode(await f.read()));
        format = result.format;
        entries.push(...result.entries);
      }
      return { format, entries };
    }
    if (markdown.length) {
      const entries = [];
      for (const f of markdown) {
        entries.push(...fromMarkdown(decoder.decode(await f.read()), { fileName: f.name.split('/').pop() }));
      }
      return { format: 'Markdown', entries };
    }
    throw new ImportError('There are no journal files in that .zip.');
  }

  const text = await file.text();
  if (/\.json$/i.test(name) || /^\s*[[{]/.test(text)) return fromJsonText(text);
  return { format: 'Markdown', entries: fromMarkdown(text, { fileName: name, fileDate: file.lastModified }) };
}

// Several picked files at once (for example a folder of Markdown files).
export async function parseImportFiles(files) {
  const all = [];
  const formats = new Set();
  for (const file of files) {
    const { format, entries } = await parseImportFile(file);
    formats.add(format);
    all.push(...entries);
  }
  return { format: [...formats].join(', ') || 'nothing', entries: all };
}
