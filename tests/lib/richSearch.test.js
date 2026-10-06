import { describe, expect, it } from 'vitest';
import {
  checklistProgress,
  parseBlocks,
  parseInline,
  prefixLines,
  stripMarkdown,
  toggleChecklistLine,
  wrapSelection,
} from '../../src/lib/richText.js';
import { highlightTerms, matchesQuery, parseQuery, relatedEntries, splitHighlights } from '../../src/lib/search.js';
import { TEMPLATES, applyTemplate } from '../../src/lib/templates.js';
import { getEntryTitle } from '../../src/lib/entryTitle.js';

describe('rich text', () => {
  const TEXT = '# Today\nIt was **great** and *calm*.\nSecond line\n\n- milk\n- eggs\n1. first\n2. second\n- [ ] call mum\n- [x] water plants';

  it('parses headings, paragraphs, lists, and checklists', () => {
    const blocks = parseBlocks(TEXT);
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bullets', 'numbered', 'checklist']);
    expect(blocks[1].lines).toEqual(['It was **great** and *calm*.', 'Second line']);
    expect(blocks[4].items).toEqual([
      { text: 'call mum', checked: false, line: 8 },
      { text: 'water plants', checked: true, line: 9 },
    ]);
  });

  it('parses bold and italic inline', () => {
    expect(parseInline('a **b** _c_ *d*')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', italic: true },
    ]);
  });

  it('strips formatting for titles and search', () => {
    expect(stripMarkdown('# Hello **world**\n- [ ] task\n1. one')).toBe('Hello world\ntask\none');
    expect(getEntryTitle({ content: '## A *good* day\nmore' })).toBe('A good day');
  });

  it('ticks and unticks one checklist line', () => {
    const ticked = toggleChecklistLine(TEXT, 8);
    expect(ticked.split('\n')[8]).toBe('- [x] call mum');
    expect(toggleChecklistLine(ticked, 8)).toBe(TEXT);
    expect(checklistProgress(TEXT)).toEqual({ done: 1, total: 2 });
  });

  it('wraps a selection and prefixes lines', () => {
    expect(wrapSelection('say hi now', 4, 6, '**')).toEqual({ text: 'say **hi** now', start: 6, end: 8 });
    expect(prefixLines('a\nb\nc', 0, 3, '- [ ] ').text).toBe('- [ ] a\n- [ ] b\nc');
    expect(prefixLines('a\nb', 0, 3, '1. ').text).toBe('1. a\n2. b');
  });

  it('templates go in as-is, or after existing text', () => {
    const gratitude = TEMPLATES.find((t) => t.id === 'gratitude');
    expect(applyTemplate('', gratitude)).toBe(gratitude.text);
    expect(applyTemplate('Already here  ', gratitude)).toBe(`Already here\n\n${gratitude.text}`);
  });
});

describe('search', () => {
  const entries = [
    { id: 1, content: 'Rainy walk in the park', mood: 'Peaceful', weatherType: 'Rain', tags: ['walks'], date: '2025-03-10T10:00' },
    { id: 2, content: 'Work was **stressful**', mood: 'Anxious', weatherType: 'Clouds', tags: ['work'], date: '2025-07-01T10:00' },
    { id: 3, content: 'Beach day, rainy evening', mood: 'Happy', weatherType: 'Clear sky', images: ['x'], date: '2026-01-05T10:00' },
    { id: 4, content: 'Voice note', audio: [{ src: 'a', duration: 3 }], date: '2026-02-01T10:00' },
  ];
  const ids = (q) => entries.filter((e) => matchesQuery(e, parseQuery(q))).map((e) => e.id);

  it('matches all plain words, in any case', () => {
    expect(ids('rainy')).toEqual([1, 3]);
    expect(ids('RAINY park')).toEqual([1]);
  });

  it('supports exact phrases and leaving words out', () => {
    expect(ids('"rainy evening"')).toEqual([3]);
    expect(ids('rainy -beach')).toEqual([1]);
  });

  it('filters by mood, weather, and tag', () => {
    expect(ids('mood:anxious')).toEqual([2]);
    expect(ids('weather:rain')).toEqual([1]);
    expect(ids('tag:walks')).toEqual([1]);
    expect(ids('mood:happy mood:peaceful')).toEqual([1, 3]);
  });

  it('filters by date', () => {
    expect(ids('before:2025-06')).toEqual([1]);
    expect(ids('after:2025')).toEqual([3, 4]);
    expect(ids('after:2025-03-10 before:2026')).toEqual([2]);
  });

  it('filters by what an entry has', () => {
    expect(ids('has:photo')).toEqual([3]);
    expect(ids('has:voice')).toEqual([4]);
    expect(ids('has:weather -rain')).toEqual([2]);
  });

  it('searches the text without its formatting marks', () => {
    expect(ids('stressful')).toEqual([2]);
    expect(ids('**')).toEqual([]);
  });

  it('highlights words and phrases', () => {
    const terms = highlightTerms(parseQuery('"rainy evening" beach mood:happy'));
    expect(terms).toEqual(['rainy evening', 'beach']);
    expect(splitHighlights('Beach day, rainy evening', terms)).toEqual([
      { text: 'Beach', match: true },
      { text: ' day, ', match: false },
      { text: 'rainy evening', match: true },
    ]);
  });

  it('finds related entries by shared tags, words, mood, and weather', () => {
    const journal = [
      { id: 1, content: 'Long walk by the river with the dog', tags: ['walks'], mood: 'Happy' },
      { id: 2, content: 'Another river walk with the dog', tags: ['walks'], mood: 'Happy' },
      { id: 3, content: 'Taxes and paperwork', tags: ['admin'], mood: 'Sad' },
      { id: 4, content: 'Dog was sick', mood: 'Anxious' },
    ];
    expect(relatedEntries(journal[0], journal).map((e) => e.id)).toEqual([2]);
  });
});
