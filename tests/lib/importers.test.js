import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  ImportError,
  fromDayOne,
  fromMarkdown,
  parseImportFile,
  parseImportFiles,
  readZip,
  toMarkdown,
} from '../../src/lib/importers.js';
import { mergeEntries } from '../../src/lib/exportImport.js';

// A real .zip, built the way zip tools do (stored or deflated files).
function makeZip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, text, store = false } of files) {
    const nameBytes = enc.encode(name);
    const raw = enc.encode(text);
    const data = store ? raw : new Uint8Array(deflateRawSync(raw));
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, store ? 0 : 8, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, store ? 0 : 8, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Uint8Array(await_concat([...locals, ...centrals, end]));
}

function await_concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function fakeFile(name, content, lastModified = Date.UTC(2026, 0, 2, 12)) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return {
    name,
    lastModified,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

const DAY_ONE = {
  metadata: { version: '1.0' },
  entries: [
    {
      uuid: 'ABC123',
      creationDate: '2026-03-04T08:15:00Z',
      text: 'Walked to the harbour\\. Saw a seal\\!\n\n![](dayone-moment://1234)\n',
      tags: ['walk', 'sea'],
      location: { localityName: 'Bergen', latitude: 60.39, longitude: 5.32 },
      weather: { conditionsDescription: 'Light Rain', temperatureCelsius: 7.6 },
    },
    { uuid: 'EMPTY', creationDate: '2026-03-05T08:15:00Z', text: '   ' },
    { uuid: 'NOWEATHER', creationDate: '2026-03-06T20:00:00Z', text: 'Quiet night.' },
  ],
};

describe('Day One', () => {
  it('turns entries into this app’s shape, with place and weather', () => {
    const [entry, second] = fromDayOne(DAY_ONE);
    expect(entry).toMatchObject({
      id: 'dayone-ABC123',
      content: 'Walked to the harbour. Saw a seal!',
      tags: ['walk', 'sea'],
      locationName: 'Bergen',
      latitude: 60.39,
      longitude: 5.32,
      weatherType: 'Rain',
      weatherIcon: '🌧️',
      temperature: '8°C',
    });
    expect(entry.date).toMatch(/^2026-03-0\dT\d\d:\d\d$/);
    expect(second).toMatchObject({ id: 'dayone-NOWEATHER', content: 'Quiet night.' });
    expect(second.weatherType).toBeUndefined();
  });

  it('skips empty entries', () => {
    expect(fromDayOne(DAY_ONE)).toHaveLength(2);
  });

  it('refuses something that is not a Day One export', () => {
    expect(() => fromDayOne({ hello: 'world' })).toThrow(ImportError);
  });

  it('gives the same ids every time, so importing twice adds nothing', () => {
    const first = mergeEntries([], fromDayOne(DAY_ONE));
    const again = mergeEntries(first.entries, fromDayOne(DAY_ONE));
    expect(again.importedCount).toBe(0);
    expect(again.skippedCount).toBe(2);
  });
});

describe('Markdown', () => {
  it('reads a single file without front matter, dating it from the file name', () => {
    const [entry] = fromMarkdown('# Rainy walk\n\nIt poured.', { fileName: '2026-05-06 rainy walk.md' });
    expect(entry).toMatchObject({ content: '# Rainy walk\n\nIt poured.', date: '2026-05-06T12:00' });
  });

  it('falls back to the file date when the name has none', () => {
    const [entry] = fromMarkdown('Hello', { fileName: 'notes.md', fileDate: new Date(2026, 0, 2, 9, 30).getTime() });
    expect(entry.date).toBe('2026-01-02T09:30');
  });

  it('reads front matter: date, mood, tags, weather, place', () => {
    const text = '---\ndate: 2026-07-01T18:45\nmood: happy\ntags: [beach, "sun, fun"]\nweather: Clear sky\ntemperature: 28°C\nlocation: Nice\n---\nSwam twice.\n';
    const [entry] = fromMarkdown(text);
    expect(entry).toMatchObject({
      date: '2026-07-01T18:45',
      mood: 'Happy',
      tags: ['beach', 'sun, fun'],
      weatherType: 'Clear sky',
      weatherIcon: '☀️',
      temperature: '28°C',
      locationName: 'Nice',
      content: 'Swam twice.',
    });
  });

  it('ignores a mood it does not know, and comma-separated tags work too', () => {
    const [entry] = fromMarkdown('---\nmood: Melancholic\ntags: a, #b\n---\nText');
    expect(entry.mood).toBeUndefined();
    expect(entry.tags).toEqual(['a', 'b']);
  });

  it('reads many entries from one file', () => {
    const text = '---\ndate: 2026-01-01T10:00\n---\nFirst\n\n---\ndate: 2026-01-02T10:00\n---\nSecond\n';
    expect(fromMarkdown(text).map((e) => e.content)).toEqual(['First', 'Second']);
  });

  it('round-trips through toMarkdown with nothing lost that Markdown can hold', () => {
    const entries = [
      { id: 2, content: 'Later one', date: '2026-02-02T10:00', mood: 'Sad', tags: ['x, y', 'z'], weatherType: 'Rain', temperature: '9°C', locationName: 'Oslo' },
      { id: 1, content: 'Earlier one\n\nwith two paragraphs', date: '2026-01-01T09:00' },
    ];
    const back = fromMarkdown(toMarkdown(entries));
    expect(back.map((e) => e.content)).toEqual(['Earlier one\n\nwith two paragraphs', 'Later one']);
    expect(back[1]).toMatchObject({ id: '2', mood: 'Sad', tags: ['x, y', 'z'], weatherType: 'Rain', temperature: '9°C', locationName: 'Oslo' });
  });

  it('gives an entry without an id the same id every time', () => {
    const a = fromMarkdown('---\ndate: 2026-01-01T10:00\n---\nSame');
    const b = fromMarkdown('---\ndate: 2026-01-01T10:00\n---\nSame');
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id).toMatch(/^md-/);
  });

  it('skips empty entries and copes with a byte-order mark and Windows line endings', () => {
    expect(fromMarkdown('   ')).toEqual([]);
    const [entry] = fromMarkdown('\uFEFF---\r\ndate: 2026-01-01T10:00\r\n---\r\nHi\r\n');
    expect(entry.content).toBe('Hi');
  });
});

describe('zip files', () => {
  it('reads stored and deflated files, and skips folders', async () => {
    const zip = makeZip([
      { name: 'a.txt', text: 'plain', store: true },
      { name: 'b.txt', text: 'squeezed '.repeat(50) },
    ]);
    const files = await readZip(zip.buffer);
    expect(files.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
    expect(new TextDecoder().decode(await files[1].read())).toBe('squeezed '.repeat(50));
    expect(new TextDecoder().decode(await files[0].read())).toBe('plain');
  });

  it('refuses something that is not a zip', async () => {
    await expect(readZip(new Uint8Array(100).buffer)).rejects.toThrow(/could not be read/);
  });
});

describe('parseImportFile', () => {
  it('reads this app’s own JSON export', async () => {
    const result = await parseImportFile(fakeFile('export.json', JSON.stringify([{ id: 1, content: 'hi', date: '2026-01-01T10:00' }])));
    expect(result).toEqual({ format: 'Weather Journal', entries: [{ id: 1, content: 'hi', date: '2026-01-01T10:00' }] });
  });

  it('recognizes a Day One JSON file, and a Day One .zip', async () => {
    expect((await parseImportFile(fakeFile('Journal.json', JSON.stringify(DAY_ONE)))).format).toBe('Day One');
    const zip = makeZip([
      { name: 'Journal.json', text: JSON.stringify(DAY_ONE) },
      { name: 'photos/', text: '' },
    ]);
    const result = await parseImportFile(fakeFile('Export.zip', zip));
    expect(result.format).toBe('Day One');
    expect(result.entries).toHaveLength(2);
  });

  it('reads a .zip of Markdown files', async () => {
    const zip = makeZip([
      { name: 'journal/2026-01-01 new year.md', text: 'Fresh start' },
      { name: 'journal/2026-01-02.md', text: '---\nmood: Peaceful\n---\nSlow day' },
      { name: '__MACOSX/journal/._2026-01-02.md', text: 'junk' },
      { name: 'journal/cover.jpg', text: 'not text' },
    ]);
    const result = await parseImportFile(fakeFile('notes.zip', zip));
    expect(result.format).toBe('Markdown');
    expect(result.entries.map((e) => [e.date, e.content, e.mood])).toEqual([
      ['2026-01-01T12:00', 'Fresh start', undefined],
      ['2026-01-02T12:00', 'Slow day', 'Peaceful'],
    ]);
  });

  it('reads a Markdown or plain text file', async () => {
    const result = await parseImportFile(fakeFile('2026-04-01.md', 'Spring!'));
    expect(result).toMatchObject({ format: 'Markdown', entries: [{ content: 'Spring!', date: '2026-04-01T12:00' }] });
  });

  it('explains files it cannot use', async () => {
    await expect(parseImportFile(fakeFile('x.json', '{oops'))).rejects.toThrow('not valid JSON');
    await expect(parseImportFile(fakeFile('x.json', '{"format":"weather-journal-backup"}'))).rejects.toThrow(/encrypted backup/);
    await expect(parseImportFile(fakeFile('x.json', '{"some":"thing"}'))).rejects.toThrow(/not a journal/);
    await expect(parseImportFile(fakeFile('x.zip', makeZip([{ name: 'a.jpg', text: 'x' }])))).rejects.toThrow(/no journal files/);
  });

  it('reads several files at once', async () => {
    const result = await parseImportFiles([fakeFile('2026-01-01.md', 'One'), fakeFile('2026-01-02.md', 'Two')]);
    expect(result.entries.map((e) => e.content)).toEqual(['One', 'Two']);
    expect(result.format).toBe('Markdown');
  });
});
